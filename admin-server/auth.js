const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
    if (!req.cookies || !req.cookies.token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = req.cookies.token;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};