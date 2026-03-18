require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const multer = require("multer");
const auth = require("./auth");
const db = require("./db");
const app = express();
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});

const upload = multer({ storage });
/* ---------------- BASIC APP SETUP ---------------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/admin", express.static(path.join(__dirname, "public")));

/* ---------------- LOGIN ---------------- */
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await db.query(
            "SELECT * FROM admin_users WHERE username = ?",
            [username]
        );

        if (!rows.length) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const admin = rows[0];
        const match = await bcrypt.compare(password, admin.password_hash);

        if (!match) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.cookie("token", token, {
            httpOnly: true,
            sameSite: "lax"
        });

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/api/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
});

app.get("/api/me", auth, (req, res) => {
    res.json({
        id: req.admin.id,
        username: req.admin.username
    });
});

/* ---------------- INVOICE NUMBER GENERATOR ---------------- */
async function generateInvoiceNumber(conn) {
    const [rows] = await conn.query(
        "SELECT current_number FROM invoice_counter FOR UPDATE"
    );

    const nextNumber = rows[0].current_number + 1;

    await conn.query(
        "UPDATE invoice_counter SET current_number = ?",
        [nextNumber]
    );

    return `INV-${String(nextNumber).padStart(6, "0")}`;
}

/* ---------------- CREATE INVOICE ---------------- */
app.post("/api/invoices", auth, async (req, res) => {
    const {
        fromProfileId,
        clientName,
        clientAddress,
        currencyCode,
        currencySymbol,
        gstEnabled,
        items
    } = req.body;

    if (!fromProfileId || !clientName || !currencyCode || !items || !items.length) {
        return res.status(400).json({ message: "Missing required data" });
    }

    function getISTDateTime() {
        const now = new Date();

        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffsetMs);

        return istDate.toISOString().slice(0, 19).replace("T", " ");
    }

    const invoiceDateTime = getISTDateTime();

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const invoiceNumber = await generateInvoiceNumber(conn);

        let subtotal = 0;
        items.forEach(i => {
            subtotal += i.quantity * i.unit_price;
        });

        const gstAmount = gstEnabled ? subtotal * 0.18 : 0;
        const total = subtotal + gstAmount;

        const [invoiceResult] = await conn.query(
            `INSERT INTO invoices (
        invoice_number,
        from_profile_id,
        client_name,
        client_address,
        invoice_date,
        currency_code,
        currency_symbol,
        subtotal,
        gst_enabled,
        gst_amount,
        total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                invoiceNumber,
                fromProfileId,
                clientName,
                clientAddress,
                invoiceDateTime,
                currencyCode,
                currencySymbol,
                subtotal,
                gstEnabled,
                gstAmount,
                total
            ]
        );

        const invoiceId = invoiceResult.insertId;

        for (const item of items) {
            await conn.query(
                `INSERT INTO invoice_items
                (invoice_id, service_name, quantity, unit_price, line_total)
                VALUES (?, ?, ?, ?, ?)`,
                [
                    invoiceId,
                    item.service_name,
                    item.quantity,
                    item.unit_price,
                    item.quantity * item.unit_price
                ]
            );
        }

        await conn.commit();

        res.json({
            success: true,
            invoiceId,
            invoiceNumber
        });

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "Failed to create invoice" });
    } finally {
        conn.release();
    }
});


function imageToBase64(filePath) {
    if (!filePath) return null;

    // filePath = "/uploads/1766775264172.png"
    const absolutePath = path.join(__dirname, filePath);

    if (!fs.existsSync(absolutePath)) {
        console.warn("❌ Watermark not found:", absolutePath);
        return null;
    }

    const image = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).substring(1);

    return `data:image/${ext};base64,${image.toString("base64")}`;
}

/* ---------------- INVOICE PREVIEW DATA ---------------- */
app.get("/api/invoices/:id", auth, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        const [[invoice]] = await db.query(
            `SELECT 
                i.*,
                bp.name AS from_name,
                bp.address AS from_address,
                bp.logo_path
            FROM invoices i
            LEFT JOIN business_profiles bp
                ON bp.id = i.from_profile_id
            WHERE i.id = ?`,
            [invoiceId]
        );

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        const [items] = await db.query(
            "SELECT service_name, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id = ?",
            [invoiceId]
        );

        res.json({
            invoice,
            items
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch invoice" });
    }
});

/* ---------------- LIST INVOICES ---------------- */
app.get("/api/invoices", auth, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                i.id,
                i.invoice_number,
                bp.name AS from_name,
                i.client_name,
                i.invoice_date,
                i.currency_symbol,
                i.total
            FROM invoices i
            LEFT JOIN business_profiles bp
                ON bp.id = i.from_profile_id
            ORDER BY i.id DESC
        `);

        res.json({ invoices: rows });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load invoices" });
    }
});

/* ---------------- DELETE INVOICE ---------------- */
app.delete("/api/invoices/:id", auth, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        const [rows] = await db.query(
            "SELECT pdf_path FROM invoices WHERE id = ?",
            [invoiceId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        if (rows[0].pdf_path && fs.existsSync(rows[0].pdf_path)) {
            fs.unlinkSync(rows[0].pdf_path);
        }

        await db.query("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
        await db.query("DELETE FROM invoices WHERE id = ?", [invoiceId]);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete invoice" });
    }
});



/* ---------------- PDF VIEW (SERVER RENDERED) ---------------- */
app.get("/admin/invoice-pdf/:id", async (req, res) => {
    const invoiceId = req.params.id;

    try {
        const [[invoice]] = await db.query(
            `SELECT 
                i.*,
                bp.name AS from_name,
                bp.address AS from_address,
                bp.logo_path
            FROM invoices i
            LEFT JOIN business_profiles bp
                ON bp.id = i.from_profile_id
            WHERE i.id = ?`,
            [invoiceId]
        );

        if (!invoice) {
            return res.status(404).send("Invoice not found");
        }

        const [items] = await db.query(
            "SELECT * FROM invoice_items WHERE invoice_id = ?",
            [invoiceId]
        );

        res.render("invoice-pdf", {
            invoice,
            items,
            profile: {
                name: invoice.from_name,
                address: invoice.from_address,
                watermarkBase64: imageToBase64(invoice.logo_path)
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to render invoice PDF");
    }
});

/* ---------------- GENERATE / DOWNLOAD PDF ---------------- */
app.get("/api/invoices/:id/pdf", auth, async (req, res) => {
    const invoiceId = req.params.id;

    try {
        const [[invoice]] = await db.query(
            `SELECT 
                i.*,
                bp.name AS from_name,
                bp.address AS from_address,
                bp.logo_path
            FROM invoices i
            LEFT JOIN business_profiles bp
                ON bp.id = i.from_profile_id
            WHERE i.id = ?`,
            [invoiceId]
        );

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        const [items] = await db.query(
            "SELECT * FROM invoice_items WHERE invoice_id = ?",
            [invoiceId]
        );

        const browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        const page = await browser.newPage();

        const html = await new Promise((resolve, reject) => {
            res.render(
                "invoice-pdf",
                {
                    invoice,
                    items,
                    profile: {
                        name: invoice.from_name,
                        address: invoice.from_address,
                        watermarkBase64: imageToBase64(invoice.logo_path)
                    }
                },
                (err, html) => {
                    if (err) reject(err);
                    else resolve(html);
                }
            );
        });

        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => window.imagesReady);

        const pdfDir = path.join(__dirname, "invoices");
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);

        const pdfPath = path.join(pdfDir, `${invoice.invoice_number}.pdf`);

        await page.pdf({
            path: pdfPath,
            format: "A4",
            printBackground: true
        });

        await browser.close();

        res.download(pdfPath);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "PDF generation failed" });
    }
});

app.post("/api/settings/change-password", auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Missing fields" });
    }

    try {
        const [rows] = await db.query(
            "SELECT password_hash FROM admin_users WHERE id = ?",
            [req.admin.id]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Admin not found" });
        }

        const isMatch = await bcrypt.compare(
            currentPassword,
            rows[0].password_hash
        );

        if (!isMatch) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        const newHash = await bcrypt.hash(newPassword, 10);

        await db.query(
            "UPDATE admin_users SET password_hash = ? WHERE id = ?",
            [newHash, req.admin.id]
        );

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to change password" });
    }
});

app.get("/api/currencies", auth, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM currencies WHERE active = 1 ORDER BY code"
        );
        res.json({ currencies: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load currencies" });
    }
});

// Add new currency
app.post("/api/currencies", auth, async (req, res) => {
    const { code, name, symbol } = req.body;

    if (!code || !name || !symbol) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    try {
        // 🔍 Check CODE conflict
        const [[codeRow]] = await db.query(
            "SELECT id FROM currencies WHERE UPPER(code) = UPPER(?) LIMIT 1",
            [code.trim()]
        );

        // 🔍 Check NAME conflict
        const [[nameRow]] = await db.query(
            "SELECT id FROM currencies WHERE LOWER(name) = LOWER(?) LIMIT 1",
            [name.trim()]
        );

        // ✅ PRECISE ERROR MESSAGES
        if (codeRow && nameRow) {
            return res.status(409).json({
                message: "Currency code and name already exist"
            });
        }

        if (codeRow) {
            return res.status(409).json({
                message: "Currency code already exists"
            });
        }

        if (nameRow) {
            return res.status(409).json({
                message: "Currency name already exists"
            });
        }

        // ✅ SAFE INSERT
        await db.query(
            "INSERT INTO currencies (code, name, symbol) VALUES (?, ?, ?)",
            [code.toUpperCase(), name.trim(), symbol]
        );

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Failed to add currency"
        });
    }
});


// Delete (deactivate) currency
app.delete("/api/currencies/:id", auth, async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM currencies WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Currency not found" });
        }

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete currency" });
    }
});

app.get("/api/business-profiles", auth, async (req, res) => {
    const [rows] = await db.query(
        "SELECT * FROM business_profiles WHERE active = 1 ORDER BY name"
    );
    res.json({ profiles: rows });
});

// Add profile
app.post(
    "/api/business-profiles",
    auth,
    upload.single("logo"),
    async (req, res) => {

        const { name, address } = req.body;
        const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

        if (!name || !address) {
            return res.status(400).json({ message: "Name and address are required" });
        }

        try {
            // 🔍 Check for existing ACTIVE profile with same name
            const [existing] = await db.query(
                "SELECT id FROM business_profiles WHERE name = ? AND active = 1",
                [name.trim()]
            );

            if (existing.length) {
                return res.status(409).json({
                    message: "Business profile with this name already exists"
                });
            }

            await db.query(
                "INSERT INTO business_profiles (name, address, logo_path) VALUES (?, ?, ?)",
                [name.trim(), address.trim(), logoPath]
            );

            res.json({ success: true });

        } catch (err) {
            console.error(err);
            res.status(500).json({
                message: "Failed to create business profile"
            });
        }
    }
);

// Delete profile
app.delete("/api/business-profiles/:id", auth, async (req, res) => {
    try {
        const profileId = Number(req.params.id);

        // Safety: prevent delete if invoices exist
        const [used] = await db.query(
            "SELECT id FROM invoices WHERE from_profile_id = ? LIMIT 1",
            [profileId]
        );

        if (used.length) {
            return res.status(409).json({
                message: "This business profile is used in invoices and cannot be deleted"
            });
        }

        const [result] = await db.query(
            "DELETE FROM business_profiles WHERE id = ?",
            [profileId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Business profile not found" });
        }

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete business profile" });
    }
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.put(
    "/api/business-profiles/:id",
    auth,
    upload.single("logo"),
    async (req, res) => {

        const profileId = Number(req.params.id);
        const { name, address } = req.body;

        if (!name || !address) {
            return res.status(400).json({ message: "Name and address are required" });
        }

        try {
            // 🔍 Check if profile exists
            const [rows] = await db.query(
                "SELECT logo_path FROM business_profiles WHERE id = ? AND active = 1",
                [profileId]
            );

            if (!rows.length) {
                return res.status(404).json({ message: "Profile not found" });
            }

            // 🔍 Check for name conflict with OTHER profiles
            const [conflict] = await db.query(
                "SELECT id FROM business_profiles WHERE name = ? AND id != ? AND active = 1",
                [name.trim(), profileId]
            );

            if (conflict.length) {
                return res.status(409).json({
                    message: "Another business profile with this name already exists"
                });
            }

            // 🖼 Preserve old logo unless replaced
            let logoPath = rows[0].logo_path;
            if (req.file) {
                logoPath = `/uploads/${req.file.filename}`;
            }

            await db.query(
                "UPDATE business_profiles SET name = ?, address = ?, logo_path = ? WHERE id = ?",
                [name.trim(), address.trim(), logoPath, profileId]
            );

            res.json({ success: true });

        } catch (err) {
            console.error(err);
            res.status(500).json({
                message: "Failed to update business profile"
            });
        }
    }
);

// ================== CONTACT FORM API ==================

const nodemailer = require("nodemailer");
const cors = require("cors");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EMAIL CONFIG
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ROUTE
app.post("/api/send-mail", async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        // VALIDATION
        if (!name || !email || !phone || !message) {
            return res.json({
                success: false,
                message: "All fields required"
            });
        }

        const emailBody = `
New lead received from Knaray website:

Name: ${name}
Email: ${email}
Phone: ${phone}

Requirements:
${message}
`;

        const mailOptions = {
            from: `"Knaray Website" <karthik.hamsanarayanan@gmail.com>`,
            replyTo: email,
            to: "karthik.hamsanarayanan@gmail.com",
            subject: "New Lead from Knaray",
            text: emailBody
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true });

    } catch (error) {
        console.error("MAIL ERROR:", error);

        res.json({
            success: false,
            message: "Mail failed"
        });
    }
});


/* ---------------- START SERVER ---------------- */
app.listen(process.env.PORT, () => {
    console.log(`Admin server running on port ${process.env.PORT}`);
});





