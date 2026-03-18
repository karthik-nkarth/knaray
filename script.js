document.addEventListener("DOMContentLoaded", () => {

    // ============================================================
    // UTIL
    // ============================================================

    function wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    function isMobile() {
        return window.innerWidth < 768;
    }

    function createCaret() {
        const caret = document.createElement("span");
        caret.className = "typing-caret";
        caret.innerHTML = "&nbsp;";
        return caret;
    }

    function removeCaret(el) {
        const caret = el.querySelector(".typing-caret");
        if (caret) caret.remove();
    }

    // ============================================================
    // Profile btn
    // ============================================================


    const profileBtn = document.getElementById("profileBtn");
    const profileOverlay = document.getElementById("profileOverlay");
    const profileClose = document.querySelector(".profile-close");

    profileBtn?.addEventListener("click", () => {
        profileOverlay.classList.add("active");
    });

    profileClose?.addEventListener("click", () => {
        profileOverlay.classList.remove("active");
    });


    // ============================================================
    // ELEMENTS
    // ============================================================

    const aboutSection = document.getElementById("about");
    const screen = document.querySelector(".monitor-screen");
    const contentScreen = document.getElementById("screenContent");

    const powerOnBtn = document.getElementById("screenPowerOn");
    const powerOffBtn = document.getElementById("screenPowerOff");

    const xpVideo = document.querySelector(".boot-video.xp");
    const win7Video = document.querySelector(".boot-video.win7");
    const loginScreen = document.querySelector(".login-screen");
    const appleVideo = document.querySelector(".boot-video.apple");


    // ============================================================
    // STATE
    // ============================================================

    let MONITOR_MODE = "IDLE";       // IDLE | INTRO | TYPING | CONTENT | OFF
    let introRunning = false;
    let inactivityTimer = null;

    let pageLoaded = false;
    let autoBootDone = false;        // auto boot only once

    // ============================================================
    // VIDEO SETUP
    // ============================================================

    xpVideo.src = "Images/Background/Monitor/boot-xp.mp4";
    win7Video.src = "Images/Background/Monitor/boot-win7.mp4";
    appleVideo.src = "Images/Background/Monitor/Apple_boot.mp4";

    appleVideo.muted = true;
    xpVideo.muted = true;
    win7Video.muted = true;

    xpVideo.load();
    appleVideo.load();
    win7Video.load();

    // ============================================================
    // RESET HELPERS
    // ============================================================

    function resetTyping() {
        document.querySelectorAll(".typing-paragraph").forEach(p => {
            p.innerHTML = "";
        });
    }

    function hardReset(initial = false) {
        introRunning = false;
        resetTyping();
        screen.classList.remove("apple-on");
        contentScreen.style.display = "none";
        powerOffBtn.style.display = "none";

        screen.classList.remove(
            "booting",
            "is-on",
            "show-content",
            "power-on",
            "is-powering-off",
            "is-off"
        );

        if (initial) {
            // Initial idle state (pure black, no buttons)
            MONITOR_MODE = "IDLE";
            powerOnBtn.style.display = "none";
        } else {
            // Real powered-off state
            MONITOR_MODE = "OFF";
            screen.classList.add("is-off");
            powerOnBtn.style.display = "flex";
        }
    }

    // ============================================================
    // TYPING
    // ============================================================

    async function typeParagraphs() {
        MONITOR_MODE = "TYPING";

        const paras = document.querySelectorAll(".typing-paragraph");

        for (let idx = 0; idx < paras.length; idx++) {
            const p = paras[idx];
            const text = p.dataset.text;
            p.innerHTML = "";

            const caret = createCaret();
            p.appendChild(caret);

            for (let i = 0; i < text.length; i++) {
                removeCaret(p);
                p.textContent = text.slice(0, i + 1);
                p.appendChild(caret);
                await wait(30);
            }

            if (idx !== paras.length - 1) {
                removeCaret(p);
            }

            await wait(350);
        }

        MONITOR_MODE = "CONTENT";
        powerOffBtn.style.display = "flex";
    }

    // ============================================================
    // INTRO / BOOT SEQUENCE
    // ============================================================

    async function startIntroSequence() {
        if (introRunning) return;
        introRunning = true;

        MONITOR_MODE = "INTRO";

        // POWER ON
        screen.classList.add("power-on");
        await wait(1200);

        screen.classList.remove("power-on");
        screen.classList.add("booting");

        if (isMobile() && appleVideo) {

            // Make video visible FIRST
            screen.classList.remove("is-off");
            screen.classList.add("booting");

            appleVideo.classList.add("active");

            // Small delay allows Safari to register visibility
            await wait(120);

            try {
                await appleVideo.play();
            } catch (e) {
                console.warn("Apple video autoplay blocked:", e);
            }

            await Promise.race([
                new Promise(res => appleVideo.addEventListener("ended", res, { once: true })),
                wait(9000)
            ]);

            appleVideo.pause();
            appleVideo.classList.remove("active");

            // Show Apple desktop
            screen.classList.remove("booting");
            screen.classList.remove("booting", "windows-on");
            screen.classList.add("is-on", "apple-on", "show-content");

            contentScreen.style.display = "flex";
            await typeParagraphs();
            return;
        }

        // VIDEO SELECT
        const bootVideo = document.body.classList.contains("day-mode")
            ? xpVideo
            : win7Video;

        bootVideo.currentTime = 0;
        bootVideo.classList.add("active");

        try {
            await bootVideo.play();
        } catch (e) { }

        await Promise.race([
            new Promise(res => bootVideo.addEventListener("ended", res, { once: true })),
            wait(12000)
        ]);

        bootVideo.pause();
        bootVideo.classList.remove("active");

        // LOGIN
        screen.classList.remove("booting");
        screen.classList.add("is-on");

        loginScreen.classList.add("active");
        await wait(5000);
        loginScreen.classList.remove("active");

        // DESKTOP
        screen.classList.add("show-content");
        contentScreen.style.display = "flex";

        autoBootDone = true;
        await typeParagraphs();
    }

    // ============================================================
    // POWER CONTROL
    // ============================================================

    function powerOffScreen() {
        if (MONITOR_MODE !== "CONTENT") return;
        clearTimeout(inactivityTimer);
        hardReset(false);
        screen.classList.remove("apple-on");
    }

    function powerOnScreen() {
        if (MONITOR_MODE !== "OFF") return;
        powerOnBtn.style.display = "none";
        startIntroSequence();
    }

    // ============================================================
    // VISIBILITY OBSERVER
    // ============================================================

    const observer = new IntersectionObserver(entries => {
        const entry = entries[0];

        // AUTO BOOT — only once, only from IDLE, only when fully visible
        if (
            pageLoaded &&
            !autoBootDone &&
            MONITOR_MODE === "IDLE" &&
            entry.intersectionRatio === 1
        ) {
            startIntroSequence();
            return;
        }

        // AUTO POWER OFF AFTER 15s INVISIBLE
        if (
            autoBootDone &&
            MONITOR_MODE === "CONTENT" &&
            entry.intersectionRatio === 0
        ) {
            inactivityTimer = setTimeout(powerOffScreen, 15000);
        } else {
            clearTimeout(inactivityTimer);
        }
    }, {
        threshold: [0, 1]
    });

    observer.observe(aboutSection);

    // ============================================================
    // EVENTS
    // ============================================================

    powerOffBtn.addEventListener("click", powerOffScreen);
    powerOnBtn.addEventListener("click", powerOnScreen);

    // ============================================================
    // FIRST LOAD
    // ============================================================

    window.addEventListener("load", () => {
        pageLoaded = true;
        hardReset(true); // initial idle (black, no button)
    });




    // ====================== FULL script.js (FINAL LIGHT GRAY LOOK & 1.0S TIMING ONLY) ======================
    // Day/night sky, clouds, stars, shooting stars, and site logic

    // The total number of unique cloud images you have (18 images confirmed).
    const ALL_CLOUD_IMAGES = [
        "Images/Background/Clouds/Cloud1.png", "Images/Background/Clouds/Cloud2.png",
        "Images/Background/Clouds/Cloud3.png", "Images/Background/Clouds/Cloud4.png",
        "Images/Background/Clouds/Cloud5.png", "Images/Background/Clouds/Cloud6.png",
        "Images/Background/Clouds/Cloud7.png", "Images/Background/Clouds/Cloud8.png",
        "Images/Background/Clouds/Cloud9.png", "Images/Background/Clouds/Cloud10.png",
        "Images/Background/Clouds/Cloud11.png", "Images/Background/Clouds/Cloud12.png",
        "Images/Background/Clouds/Cloud13.png", "Images/Background/Clouds/Cloud14.png",
        "Images/Background/Clouds/Cloud15.png", "Images/Background/Clouds/Cloud16.png",
        "Images/Background/Clouds/Cloud17.png", "Images/Background/Clouds/Cloud18.png"
    ];

    // Number of clouds to appear immediately on page load
    const INITIAL_CLOUD_COUNT = 8;
    // Removed: let availableCloudImages = [...ALL_CLOUD_IMAGES];
    // Removed: let usedCloudImages = new Set();

    let cloudLoopTimer = null;
    let lightningLoopTimer = null;


    // -------------------- LIGHTNING EFFECT VARIABLES --------------------

    const heroSection = document.getElementById('hero');


    // -------------------- HELPER FUNCTION: Get Random Cloud Source (Fixed for endless loop) --------------------

    function getRandomCloudSource() {
        // Select a random image from the full, constant list.
        const randomIndex = Math.floor(Math.random() * ALL_CLOUD_IMAGES.length);
        return ALL_CLOUD_IMAGES[randomIndex];
    }

    // -------------------- LIGHTNING EFFECT LOGIC (REPEATING TIMER) --------------------

    /**
     * Executes a smooth, timed color flash on a cloud element.
     * Total duration is 1.0 seconds (0.5s fade in + 0.5s fade out).
     * @param {HTMLElement} cloud - The cloud image element.
     */
    function triggerFlash(cloud) {
        if (cloud.isFlashing) return;

        cloud.isFlashing = true;

        // 1. Start Fade In to Light Gray (takes 0.5s due to CSS transition)
        cloud.style.filter = 'brightness(0.9)';

        // 2. Schedule Fade Out Start after 500 milliseconds
        setTimeout(() => {
            cloud.style.filter = 'none';
        }, 500); // Start fade out after 500ms (end of fade in)

        // 3. Schedule the flag reset after the fade out is complete
        setTimeout(() => {
            cloud.isFlashing = false;
        }, 1000); // 1000ms for total duration
    }

    /**
     * Checks if a given cloud element is visible within the bounds of the hero section.
     */
    function isCloudOverHero(cloud, heroRect) {
        const cloudRect = cloud.getBoundingClientRect();

        return (
            cloudRect.right >= heroRect.left &&
            cloudRect.left <= heroRect.right &&
            cloudRect.bottom >= heroRect.top &&
            cloudRect.top <= heroRect.bottom
        );
    }


    function startLightningLoop() {
        if (lightningLoopTimer) return;

        function lightningTick() {
            if (!document.body.classList.contains("day-mode") || !heroSection) {
                lightningLoopTimer = setTimeout(lightningTick, 500);
                return;
            }

            const clouds = document.querySelectorAll('.cloud');
            const heroRect = heroSection.getBoundingClientRect();

            clouds.forEach(cloud => {
                if (isCloudOverHero(cloud, heroRect) && !cloud.isFlashing) {

                    // 5% chance every 500ms scan
                    if (Math.random() < 0.05) {
                        triggerFlash(cloud);
                    }
                }
            });

            // Check for lightning every 500 milliseconds (0.5 seconds)
            lightningLoopTimer = setTimeout(lightningTick, 500);
        }

        lightningTick();
    }

    function stopLightningLoop() {
        if (lightningLoopTimer) {
            clearTimeout(lightningLoopTimer);
            lightningLoopTimer = null;
        }
    }


    // -------------------- CLOUDS (DAY MODE) --------------------

    function createCloud(isSeeding = false) {
        const container = document.getElementById("cloud-container");
        if (!container) return;

        // FIX: Use getRandomCloudSource for endless loop
        const cloudSrc = getRandomCloudSource();
        if (!cloudSrc) return;

        const cloud = document.createElement("img");
        cloud.classList.add("cloud");
        cloud.src = cloudSrc;
        cloud.isFlashing = false;

        // FIX: No need to track used images, just remove on animation end
        cloud.addEventListener('animationiteration', function onAnimationIteration() {
            // usedCloudImages.delete(this.src); // REMOVED
            this.removeEventListener('animationiteration', onAnimationIteration);
            this.remove();
        }, { once: true });


        const scale = Math.random() * 0.4 + 0.6;
        cloud.style.transform = `scale(${scale})`;

        cloud.style.top = Math.random() * 70 + "vh";

        const duration = Math.random() * 60000 + 90000;
        cloud.style.animationDuration = duration + "ms";


        if (isSeeding) {
            const randomCyclePosition = Math.random();
            const delay = randomCyclePosition * duration * -1;
            cloud.style.animationDelay = delay + "ms";

        } else {
            cloud.style.animationDelay = "0s";
        }

        container.appendChild(cloud);
    }

    // -------------------- MODIFIED CLOUD LOOP CONTROL --------------------

    function startCloudLoop() {
        if (cloudLoopTimer) return;

        if (document.body.classList.contains("day-mode") && document.querySelectorAll('.cloud').length === 0) {
            for (let i = 0; i < INITIAL_CLOUD_COUNT; i++) {
                createCloud(true);
            }
        }

        startLightningLoop();

        function tick() {
            if (document.body.classList.contains("day-mode")) {
                createCloud(false);
            }
            const delay = Math.random() * 8000 + 10000;
            cloudLoopTimer = setTimeout(tick, delay);
        }

        const initialDelayForContinuousFlow = Math.random() * 1000 + 500;
        cloudLoopTimer = setTimeout(tick, initialDelayForContinuousFlow);
    }

    function clearClouds() {
        const container = document.getElementById("cloud-container");
        if (container) {
            container.innerHTML = '';
        }
        stopLightningLoop();
        // FIX: Removed logic for clearing tracking sets/arrays
        // usedCloudImages.clear();
        // availableCloudImages = [...ALL_CLOUD_IMAGES]; 
    }

    function stopCloudLoop() {
        if (cloudLoopTimer) {
            clearTimeout(cloudLoopTimer);
            cloudLoopTimer = null;
        }
        stopLightningLoop();
    }

    // -------------------- PAGE VISIBILITY FIX --------------------

    function handleVisibilityChange() {
        const clouds = document.querySelectorAll('.cloud');

        if (document.hidden) {
            clouds.forEach(cloud => cloud.classList.add('cloud-pause-fix'));
            stopLightningLoop();
        } else {
            clouds.forEach(cloud => cloud.classList.remove('cloud-pause-fix'));
            if (document.body.classList.contains('day-mode')) {
                startLightningLoop();
            }
        }
    }

    // -------------------- SYNCHRONOUS INITIALIZATION --------------------

    function preloadAllCloudImages() {
        const promises = ALL_CLOUD_IMAGES.map(src => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => {
                    console.error(`Failed to load cloud image: ${src}`);
                    resolve();
                };
                img.src = src;
            });
        });
        return Promise.all(promises);
    }


    // ** EXECUTION START **
    console.log("Starting cloud image preload...");

    preloadAllCloudImages().then(() => {
        console.log("All cloud images preloaded. Setting initial theme and starting loops.");

        const savedTheme = localStorage.getItem('theme');

        if (savedTheme === 'dark') {
            setMode(true);
        } else {
            setMode(false);
        }

    }).catch(error => {
        console.error("Preloading error, falling back to setMode.");

        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            setMode(true);
        } else {
            setMode(false);
        }
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);


    // Placeholder functions for completeness (these should exist in your actual script)
    function generateStars(target, count) { /* implementation */ }
    function attachStarParallax() { /* implementation */ }
    function createShootingStar() { /* implementation */ }
    function startShootingStarLoop() { /* implementation */ }
    function stopShootingStarLoop() { /* implementation */ }
    function clearShootingStars() { /* implementation */ }
    function setMode(isDark) { /* implementation */ }

    // The rest of the original file's functions (DOM listeners, case studies, etc.) would follow here.

    // ----------------------------------------------------------------
    // ----------------------------------------------------------------
    // -------------------- STARFIELD (NIGHT MODE) --------------------
    // ----------------------------------------------------------------
    // ----------------------------------------------------------------

    // Generate three layers of stars (call once)
    function generateStars(target, count) {
        const container = document.getElementById(target);
        if (!container) return;
        for (let i = 0; i < count; i++) {
            const star = document.createElement("div");
            star.classList.add("star");

            const size = Math.random() * 2 + 1;
            star.style.width = size + "px";
            star.style.height = size + "px";

            star.style.top = Math.random() * 100 + "vh";
            star.style.left = Math.random() * 100 + "vw";

            star.style.animationDuration = (1.5 + Math.random() * 3) + "s";

            container.appendChild(star);
        }
    }

    // Parallax on mousemove (works when layers exist)
    function attachStarParallax() {
        const l1 = document.getElementById("starfield");
        const l2 = document.getElementById("starfield2");
        const l3 = document.getElementById("starfield3");
        if (!l1 || !l2 || !l3) return;

        document.addEventListener("mousemove", (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 20;
            const y = (e.clientY / window.innerHeight - 0.5) * 20;

            l1.style.transform = `translate(${x}px, ${y}px)`;
            l2.style.transform = `translate(${x / 2}px, ${y / 2}px)`;
            l3.style.transform = `translate(${x / 4}px, ${y / 4}px)`;
        });
    }

    // -------------------- SHOOTING STARS (NIGHT MODE) --------------------
    // create a single shooting star that travels edge-to-edge
    function createShootingStar() {
        const star = document.createElement("div");
        star.className = "shooting-star";

        const w = window.innerWidth;
        const h = window.innerHeight;

        // pick random start edge and opposite end
        const edges = ["top", "bottom", "left", "right"];
        const startEdge = edges[Math.floor(Math.random() * edges.length)];

        let startX, startY, endX, endY;

        if (startEdge === "top") {
            startX = Math.random() * w;
            startY = -30;
            endX = Math.random() * w;
            endY = h + 30;
        } else if (startEdge === "bottom") {
            startX = Math.random() * w;
            startY = h + 30;
            endX = Math.random() * w;
            endY = -30;
        } else if (startEdge === "left") {
            startX = -30;
            startY = Math.random() * h;
            endX = w + 30;
            endY = Math.random() * h;
        } else { // right
            startX = w + 30;
            startY = Math.random() * h;
            endX = -30;
            endY = Math.random() * h;
        }

        // Match these with CSS (.shooting-star)
        const trailLength = 22; // px (short trail)
        const trailThickness = 2; // px (thin)

        // Place element so its RIGHT edge (head) is at startX,startY
        star.style.width = trailLength + "px";
        star.style.height = trailThickness + "px";
        star.style.left = (startX - trailLength) + "px";
        star.style.top = (startY - trailThickness / 2) + "px";

        // compute angle for rotation (head points toward end)
        const angleRad = Math.atan2(endY - startY, endX - startX);
        const angleDeg = angleRad * 180 / Math.PI;

        // rotate element so tail points backwards and head faces the motion direction
        star.style.transform = `rotate(${angleDeg}deg)`;

        // animate via left/top to preserve rotation (so tail always points correctly)
        const duration = 5500 + Math.random() * 3000; // 5.5 - 8.5s

        const frames = [
            { left: (startX - trailLength) + "px", top: (startY - trailThickness / 2) + "px", opacity: 1 },
            { left: (endX - trailLength) + "px", top: (endY - trailThickness / 2) + "px", opacity: 0.25 }
        ];

        // append then animate
        document.body.appendChild(star);
        const anim = star.animate(frames, {
            duration: duration,
            easing: "cubic-bezier(.22,.9,.35,1)"
        });

        // cleanup when animation finishes
        anim.onfinish = () => {
            star.remove();
        };
    }

    // shooting star loop control (alternating 15s/30s)
    let shootingStarTimer = null;
    let shootingNextDelay = 15000; // start with 15s

    function startShootingStarLoop() {
        if (shootingStarTimer) return; // already running

        function tick() {
            if (document.body.classList.contains("dark-mode")) createShootingStar();
            // flip delay
            shootingNextDelay = shootingNextDelay === 15000 ? 30000 : 15000;
            shootingStarTimer = setTimeout(tick, shootingNextDelay);
        }

        shootingStarTimer = setTimeout(tick, shootingNextDelay);
    }

    function stopShootingStarLoop() {
        if (shootingStarTimer) {
            clearTimeout(shootingStarTimer);
            shootingStarTimer = null;
        }
    }

    // remove any existing shooting stars
    function clearShootingStars() {
        document.querySelectorAll('.shooting-star').forEach(s => s.remove());
    }


    // -------------------- MODE TOGGLE / LIFECYCLE --------------------
    function clearAllVisuals() {
        clearClouds();
        clearShootingStars();
    }

    // -------------------- CORRECTED setMode (use day-mode <-> dark-mode) --------------------
    function setMode(isDark) {
        const body = document.body;
        const modeIcon = document.querySelector('.mode-icon');
        const toggleButton = document.getElementById('dark-mode-toggle');

        if (isDark) {
            // NIGHT
            body.classList.add('dark-mode');
            body.classList.remove('day-mode');

            // icon change (sun shown to switch back to day)
            if (modeIcon) modeIcon.innerHTML = '<i class="fas fa-sun" style="color: white;"></i>';
            if (toggleButton) toggleButton.setAttribute('title', 'Day Mode');

            // stop clouds, clear them (using the new functions)
            stopCloudLoop();
            clearClouds();

            // ensure stars exist and start shooting stars
            startShootingStarLoop();

            localStorage.setItem('theme', 'dark');
        } else {
            // DAY
            body.classList.remove('dark-mode');
            body.classList.add('day-mode');

            if (modeIcon) modeIcon.innerHTML = '<i class="fas fa-moon"></i>';
            if (toggleButton) toggleButton.setAttribute('title', 'Night Mode');

            // stop shooting stars and clear
            stopShootingStarLoop();
            clearShootingStars();

            startCloudLoop();

            localStorage.setItem('theme', 'light');
        }
    }

    const powerLed = document.querySelector(".power-led");

    const redBtn = document.getElementById("screenPowerOff");
    const greenBtn = document.getElementById("screenPowerOn");
    let hasEverBooted = false;

    // Default state (page loads with monitor ON)
    powerLed.classList.add("is-on");
    powerLed.classList.remove("is-off");

    // Red button → LED RED
    redBtn.addEventListener("click", () => {
        powerLed.classList.remove("is-on");
        powerLed.classList.add("is-off");
    });

    // Green button → LED GREEN
    greenBtn.addEventListener("click", () => {
        powerLed.classList.remove("is-off");
        powerLed.classList.add("is-on");
    });

    // -------------------- ON DOM READY: initialize everything --------------------

    // 1) Star layers generation (do it once)
    generateStars("starfield", 80);
    generateStars("starfield2", 120);
    generateStars("starfield3", 200);
    attachStarParallax();

    // 2) Hook up toggle (and restore saved theme)
    const toggleButton = document.getElementById('dark-mode-toggle');

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            const currentlyDark = document.body.classList.contains('dark-mode');
            setMode(!currentlyDark);
        });
    }


    // ---------- The rest of your existing site JS (carousel, modals, testimonials) ----------
    // --- UTILITY FUNCTION ---
    function getCardSpacing() {
        const rootStyles = getComputedStyle(document.documentElement);
        let spacingValue = rootStyles.getPropertyValue('--card-spacing');
        return parseFloat(spacingValue);
    }

    const CARD_SPACING = getCardSpacing();

    // --- CASE STUDIES CAROUSEL LOGIC (KEPT INTACT) ---
    let items = document.querySelectorAll('#case-studies .slider .item'); // Scoped to Case Studies
    let next = document.getElementById('next-card');
    let prev = document.getElementById('prev-card');
    let cardCount = items.length;
    let active = 2; // Set the default start card (Card C is index 2)
    const caseStudyGrid = document.querySelector('#case-studies .card-grid');

    function loadCaseStudyShow() {
        if (items.length === 0) return;
        let stt = 0;

        // 1. ACTIVE CARD
        items[active].style.transform = `none`;
        items[active].style.zIndex = 10;
        items[active].style.filter = 'none';
        items[active].style.opacity = 1;
        items[active].style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.2), 0 15px 30px rgba(255, 102, 0, 0.4)';

        // 2. CARDS TO THE RIGHT
        for (let i = active + 1; i < items.length; i++) {
            stt++;
            const scale = 1 - 0.15 * stt;
            const opacity = stt > 2 ? 0 : 0.6;
            items[i].style.transform = `translateX(${CARD_SPACING * stt + 120}px) 
                                             scale(${scale}) 
                                             translateZ(-${80 * stt}px) 
                                             rotateY(-${20 * stt}deg)`;
            items[i].style.zIndex = 10 - stt;
            items[i].style.filter = `blur(${3 * stt}px)`;
            items[i].style.opacity = opacity;
            items[i].style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.08)';
        }

        stt = 0;

        // 3. CARDS TO THE LEFT
        for (let i = active - 1; i >= 0; i--) {
            stt++;
            const scale = 1 - 0.15 * stt;
            const opacity = stt > 2 ? 0 : 0.6;
            items[i].style.transform = `translateX(${-CARD_SPACING * stt - 120}px) 
                                             scale(${scale}) 
                                             translateZ(-${80 * stt}px) 
                                             rotateY(${20 * stt}deg)`;
            items[i].style.zIndex = 10 - stt;
            items[i].style.filter = `blur(${3 * stt}px)`;
            items[i].style.opacity = opacity;
            items[i].style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.08)';
        }
    }

    // AUTOSLIDE AND NAVIGATION CONTROL
    if (items.length > 0) loadCaseStudyShow();

    const autoSlideDelay = 12000;
    let autoSlideInterval = null;

    function isCarouselInViewport() {
        if (!caseStudyGrid) return false;
        const rect = caseStudyGrid.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const isVisible = (
            rect.top < viewportHeight - 100 &&
            rect.bottom > 100
        );
        return isVisible;
    }

    const stopAutoSlide = () => {
        clearInterval(autoSlideInterval);
        autoSlideInterval = null;
    };

    const startAutoSlide = () => {
        if (autoSlideInterval === null) {
            autoSlideInterval = setInterval(() => {
                active = (active + 1) % cardCount;
                loadCaseStudyShow();
            }, autoSlideDelay);
        }
    };

    const resetAutoSlide = () => {
        stopAutoSlide();
        startAutoSlide();
    };

    function handleScrollAndVisibility() {
        if (document.visibilityState === 'hidden' || !isCarouselInViewport()) {
            stopAutoSlide();
        } else {
            startAutoSlide();
        }
    }

    document.addEventListener("visibilitychange", handleScrollAndVisibility);
    window.addEventListener("scroll", handleScrollAndVisibility);

    // Initial start
    handleScrollAndVisibility();
    window.addEventListener('resize', () => {
        loadCaseStudyShow();
    });

    // CASE STUDY NAVIGATION
    if (next && prev) {
        next.onclick = function () {
            active = (active + 1) % cardCount;
            loadCaseStudyShow();
            resetAutoSlide();
        }

        prev.onclick = function () {
            active = (active - 1 + cardCount) % cardCount;
            loadCaseStudyShow();
            resetAutoSlide();
        }
        caseStudyGrid.addEventListener('mouseenter', stopAutoSlide);
        caseStudyGrid.addEventListener('mouseleave', startAutoSlide);
    }

    // --- CASE STUDY MODAL LOGIC (UNTUCHED) ---
    const caseStudyModal = document.getElementById('caseStudyModal');
    const closeButton = document.querySelector('.close-button'); // Case Study Close Button
    const modalClientName = document.getElementById('modalClientName');
    const modalChallenge = document.getElementById('modalChallenge');
    const modalSolution = document.getElementById('modalSolution');
    const modalOutcomes = document.getElementById('modalOutcomes');
    const modalCharts = document.getElementById('modalCharts');
    const modalConclusion = document.getElementById('modalConclusion');

    const caseStudyData = {
        "client-a": {
            clientName: "Australian HypnoTherapy",
            challenge: "Client had a running Google Ads account, however their conversions were very less while cost spent remained constant. Since the client was running a business under the 'Health Care' category they struggled to get the campaings running properly as well due to the industries advertising limitations",
            solution: "We implemented a change in campaing type run and ensured that the keywords are sorted in requirment for compliance. Ensured that their website was much more conversion friendly and efficent on SEO at the same time. Setup online and offline conversion tracking to get ture source of results",
            outcomes: [
                { value: "105% ||", label: " Conversion Increase" },
                { value: "104% ROAS ||", label: " Actual ROAS skyrocketed from 16.54% to 104.11%" },
                { value: "3 Months ||", label: " Project Duration" }
            ],
            chartImage1: "Images/Portfolio Data/Card Data/Silke Before.png",
            chartImage2: "Images/Portfolio Data/Card Data/Silke After.png",
            conclusion: "Through continuous optimization and strategic targeting, Client achieved a significant boost in qualified leads, dramatically improving their sales efficiency and ROI.",
            reportUrl: "#"
        },
        "client-b": {
            clientName: "Atlas MOFA Attestation",
            challenge: "Client wanted a brand-new Google Ads account and wanted to generate good branding and gain leads. Client business objective applies under 'Legal Services' hence the account had to be very compliant with legal policies.",
            solution: "I built the Google Ads account from scratch with a tightly structured campaign setup focused on high-intent attestation keywords. Implemented strong keyword segmentation, negative keyword filtering, and conversion-optimized ad copies. Conversion tracking was configured accurately to measure real lead actions and continuously optimize performance during the learning phase.",
            outcomes: [
                { value: "382 Leads ||", label: " Total Conversions Generated" },
                { value: "AED 74 ||", label: " Cost per Conversion (Below Market Average)" },
                { value: "4 Months ||", label: " Project Duration" }
            ],
            chartImage1: "Images/Portfolio Data/Card Data/Atlas Attestation.png",
            chartImage2: "Images/Portfolio Data/Card Data/Atlas Attestation Secondary.png",
            conclusion: "Within four months, a newly launched Google Ads account delivered 382 qualified leads at a cost per conversion of AED 74, positioning it among the most cost-efficient campaigns in the attestation services segment. With one of the lowest CPCs compared to similar service-based businesses, the campaign demonstrates how focused targeting and optimization can drive scalable, high-quality leads at below-market costs.",
            reportUrl: "#"
        },
        "client-c": {
            clientName: "I AM LOU",
            challenge: "The client faced repeated product disapprovals in Google Merchant Center due to feed errors, duplicate listings, and missing attributes, preventing their products from going live and impacting visibility on Google Shopping. Client also had a lot of trouble to keep GMC and thier website products in same sync",
            solution: "We performed a complete Merchant Center audit, resolved feed errors, removed duplicate product entries, corrected attribute mismatches, and restructured the product feed to comply fully with Google Merchant Center policies. The feed was re-synced and monitored until full approval was achieved. This whole thing was achieved via the API option avilable to keep the products updated ensuring automation for future purposes.",
            outcomes: [
                { value: "100%", label: "Products Approved & Live" },
                { value: "Automation", label: "Sync of new products / changes on website" },
                { value: "0 Errors", label: "Feed & Policy Issues Remaining" }
            ],
            chartImage1: "Images/Portfolio Data/Card Data/iamlou2.png",
            chartImage2: "Images//Portfolio Data/Card Data/iamlou primay2.png",
            conclusion: "Within a week, all products were successfully approved and made live on Google Merchant Center. The optimised feed ensured long-term compliance, reduced the risk of future disapprovals, and enabled the client to scale their Shopping campaigns confidently.",
            reportUrl: "#"
        },
        "client-d": {
            clientName: "NoaTune Studios: Offline Conversion Tracking Implementation",

            challenge: "NoaTune Studios was facing unsustainably high acquisition costs (£84+ CPA) and low lead volumes due to a severe data disconnect between their Google Ads clicks and actual offline studio bookings. Their Webflow website and Zoho CRM were not passing ad click data through the lead pipeline, making it impossible to identify which campaigns were driving real customers.",

            solution: "I designed and implemented a full offline conversion tracking architecture. I modified the Webflow iframe forms to capture the Google Ads GCLID and store it with lead submissions in Zoho CRM. Using Zoho webhooks and Google Apps Script, I built an automated pipeline that transferred qualified lead data into Google Sheets and formatted it for Google Ads offline conversion uploads. This created a reliable attribution path from ad click → lead → confirmed studio booking.",

            outcomes: [
                { value: "100%", label: "Lead Attribution Visibility" },
                { value: "£84+", label: "CPA Data Gap Identified" },
                { value: "Full Funnel", label: "Click → Lead → Booking Tracking" },
                { value: "600%", label: "Increase in Weekly Conversion Volume" }
            ],

            chartImage1: "Images/Portfolio Data/Card Data/noatune metrics.png",
            chartImage2: "Images/Portfolio Data/Card Data/Noatune metrics 2.png",

            conclusion: "This measurement architecture connected Google Ads, the Webflow website, Zoho CRM, and Google Sheets into a single attribution pipeline. With offline conversion tracking in place, NoaTune could finally optimize campaigns based on real studio bookings instead of form submissions alone.",

            reportUrl: "#"
        },
        "focally-optimization": {
            clientName: "Focally: Checkout & Pixel Optimization",
            challenge: "Focally experienced a critical caching issue where their GoKwik checkout popup failed to load when users clicked 'Add to Cart'. Furthermore, standard Meta (Facebook) e-commerce tracking events for Add to Cart and Purchase were not firing or aligning correctly with INR currency.",
            solution: "To bypass the aggressive caching, a dynamic cache-busting timestamp was appended to the 'single_add_to_cart_button' URL, forcing the checkout popup to trigger reliably. For tracking, the Meta Pixel was correctly configured to capture standard e-commerce events ('AddToCart' and 'Purchase') using the official Meta app integration.",
            outcomes: [
                { value: "100%", label: " Checkout Popup Load Rate" },
                { value: "Active", label: " Meta Purchase Tracking" },
                { value: "Zero", label: " Lost Add-to-Cart Clicks" }
            ],
            chartImage1: "Images/Portfolio Data/Card Data/Focally Sample 2.png",
            chartImage2: "Images/Portfolio Data/Card Data/Focally Sample 1.png",
            conclusion: "By resolving the caching conflict, the primary checkout flow was successfully restored. Accurate Meta Pixel tracking was also established, ensuring all high-value e-commerce actions are now properly reported for Focally's marketing campaigns.",
            reportUrl: "#"
        }
    };

    function openCaseStudyModal(caseId) {
        const data = caseStudyData[caseId];
        if (!data) {
            console.error("Case study data not found for ID:", caseId);
            return;
        }
        modalClientName.textContent = data.clientName;
        modalChallenge.innerHTML = data.challenge;
        modalSolution.innerHTML = data.solution;
        modalConclusion.innerHTML = data.conclusion;
        modalOutcomes.innerHTML = '';
        modalCharts.innerHTML = '';

        // Generate Outcome Grid
        const outcomeGrid = document.createElement('div');
        outcomeGrid.classList.add('outcome-grid');
        data.outcomes.forEach(item => {
            const outcomeDiv = document.createElement('div');
            outcomeDiv.classList.add('outcome-item');
            outcomeDiv.innerHTML = `<span class="value">${item.value}</span><span class="label">${item.label}</span>`;
            outcomeGrid.appendChild(outcomeDiv);
        });
        modalOutcomes.appendChild(outcomeGrid);

        // Add charts with the dynamic image sources
        modalCharts.innerHTML = `
            <div class="chart-container">
                <img src="${data.chartImage1}" alt="Performance Chart 1" class="img-fluid mb-3">
                <img src="${data.chartImage2}" alt="Performance Chart 2" class="img-fluid">
            </div>
        `;

        caseStudyModal.style.display = "flex";
        document.body.classList.add('modal-open');
    }

    // Event listeners for opening modal
    document.querySelectorAll('.view-case-study-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const caseId = e.currentTarget.getAttribute('data-case-id');
            openCaseStudyModal(caseId);
        });
    });

    // Event listeners for closing modal
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            caseStudyModal.style.display = "none";
            document.body.classList.remove('modal-open');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === caseStudyModal) {
            caseStudyModal.style.display = "none";
            document.body.classList.remove('modal-open');
        }
    });

    // --- TESTIMONIAL DATA & MODAL LOGIC (kept) ---
    const testimonialData = {
        "jane-doe": {
            dp: "https://randomuser.me/api/portraits/women/68.jpg",
            fullQuote: "Working with Karthik was a game-changer for TechNova. His strategy wasn't just about throwing money at ads; it was a deeply analytical approach. The lead quality improved drastically, and our sales pipeline expanded by an incredible 200% in just two quarters. I've never seen such a precise and results-driven specialist. Highly recommend him for scaling any business!",
            name: "Jane Doe",
            title: "CEO, TechNova"
        },
        "mark-johnson": {
            dp: "https://randomuser.me/api/portraits/men/91.jpg",
            fullQuote: "Our e-commerce site was hemorrhaging money due to high cart abandonment. Karthik audited our entire funnel, implemented a series of A/B tests, and delivered a solution that reduced our abandonment rate by 40%. The technical proficiency combined with a keen business sense is rare. He truly transformed our conversion performance and our bottom line.",
            name: "Mark Johnson",
            title: "Founder, StyleUp"
        },
        "michael-ross": {
            dp: "https://randomuser.me/api/portraits/men/85.jpg",
            fullQuote: "When we hired Karthik for SEO, our organic traffic was stagnant. In just six months, it had tripled. Beyond the surface-level SEO, his technical knowledge, especially his implementation of custom Schema markup, was absolutely unmatched. He solved indexation issues we didn't even know we had. A true SEO wizard.",
            name: "Michael Ross",
            title: "Marketing Dir, GreenLife"
        },
        "emily-blunt": {
            dp: "https://randomuser.me/api/portraits/women/65.jpg",
            fullQuote: "Karthik restructured our entire social media advertising strategy on Facebook and Instagram. Before, we were struggling with high costs and low engagement. After his optimization, our Cost Per Acquisition dropped by 35%, and our brand visibility soared. His campaign management is meticulous, and the return on investment speaks for itself. An exceptional marketer.",
            name: "Emily Blunt",
            title: "Head of Comms, FinTech"
        },
        "david-lee": {
            dp: "https://randomuser.me/api/portraits/men/33.jpg",
            fullQuote: "We needed someone to scale our Google Ads budget without compromising profitability. Karthik is a master of Google Ads automation and strategy. He successfully took our monthly spend from $10,000 to over $50,000 while maintaining a consistent 5x ROAS. He's strategic, analytical, and incredibly reliable. The best PPC expert we've ever worked with.",
            name: "David Lee",
            title: "E-commerce Manager, GearZone"
        },
        "anya-sharma": {
            dp: "https://randomuser.me/api/portraits/women/55.jpg",
            fullQuote: "As a webmaster, I appreciate detail. Karthik's technical SEO audit was the most comprehensive report I've ever received. He pinpointed and fixed a complex, long-standing indexation issue that was hurting our ranking, resulting in a swift recovery and massive traffic gain. If you need deep technical expertise, look no further.",
            name: "Anya Sharma",
            title: "Webmaster, DataBridge"
        },
        "chris-gomez": {
            dp: "https://randomuser.me/api/portraits/men/50.jpg",
            fullQuote: "We were sending a lot of traffic to our landing pages but failing to convert. Karthik stepped in, analyzed user behavior, and redesigned/optimized our custom landing pages. The results were astounding: our conversion rate jumped from 5% to 18%! The blend of design thinking and conversion optimization skills is world-class.",
            name: "Chris Gomez",
            title: "Product Lead, Innovate360"
        },
        "sarah-chen": {
            dp: "https://randomuser.me/api/portraits/women/48.jpg",
            fullQuote: "Migrating a website with thousands of pages is terrifying, but Karthik managed the entire process flawlessly. We experienced **zero drops** in our organic search rankings post-migration, which is a testament to his meticulous planning and execution. It was a seamless transition and a huge win for our team.",
            name: "Sarah Chen",
            title: "Operations Director, GlobalConnect"
        },
        "alex-williams": {
            dp: "https://randomuser.me/api/portraits/men/78.jpg",
            fullQuote: "Karthik didn't just run ads; he built us a powerful, custom data reporting dashboard using advanced tracking. This gave us real-time, actionable insights that completely changed how we allocate marketing spend. His ability to bridge the gap between marketing strategy and technical development is truly impressive.",
            name: "Alex Williams",
            title: "CTO, CloudScale"
        },
        "olivia-davis": {
            dp: "https://randomuser.me/api/portraits/women/20.jpg",
            fullQuote: "Our marketing funnel felt broken, but we couldn't pinpoint why. Karthik's full funnel audit was incredibly insightful, identifying major friction points. The simple, yet strategic fixes he implemented led to an instant 25% increase in lead velocity and much higher quality leads. He has a brilliant mind for optimization.",
            name: "Olivia Davis",
            title: "VP of Sales, MarketPro"
        },
        "ben-taylor": {
            dp: "https://randomuser.me/api/portraits/men/44.jpg",
            fullQuote: "What sets Karthik apart is that he's more than a contractor; he's a true strategic partner. Beyond his immense technical skill in both dev and digital marketing, his proactive approach to emerging trends and algorithm changes kept us consistently ahead of our competition. A massive asset to any growth-focused company.",
            name: "Ben Taylor",
            title: "Digital Strategist, AdVantage"
        },
        "catherine-smith": {
            dp: "https://randomuser.me/api/portraits/women/88.jpg",
            fullQuote: "Our video advertising was underperforming. Karthik quickly designed and implemented a systematic creative testing framework. The results were incredible: we achieved a 2x lower CPM and significantly higher engagement almost immediately. He knows how to make content work hard for the marketing goal.",
            name: "Catherine Smith",
            title: "Creative Director, VisionMedia"
        }
    };

    const testimonialModalElement = document.getElementById('testimonialModal');
    const modalDp = document.getElementById('modalDp');
    const modalQuote = document.getElementById('modalQuote');
    const modalName = document.getElementById('modalName');
    const testimonialClientTitle = document.getElementById('testimonialClientTitle');
    const testimonialCloseButton = testimonialModalElement ? testimonialModalElement.querySelector('.modal-close-btn') : null;
    const readNowButtons = document.querySelectorAll('.read-more-btn');

    const openTestimonialModal = (clientKey) => {
        const data = testimonialData[clientKey];
        if (!data) {
            console.error(`No testimonial data found for key: ${clientKey}`);
            return;
        }

        modalDp.src = data.dp;
        modalQuote.textContent = data.fullQuote;
        modalName.textContent = data.name;
        testimonialClientTitle.textContent = data.title;

        testimonialModalElement.style.display = "flex";
        document.body.classList.add('modal-open');
    };

    const closeTestimonialModal = () => {
        testimonialModalElement.style.display = "none";
        document.body.classList.remove('modal-open');
    };

    readNowButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const clientKey = e.currentTarget.getAttribute('data-client');
            openTestimonialModal(clientKey);
        });
    });

    if (testimonialCloseButton) {
        testimonialCloseButton.addEventListener('click', closeTestimonialModal);
    }

    window.addEventListener('click', (e) => {
        if (e.target === testimonialModalElement) {
            closeTestimonialModal();
        }
    });

    // --- TESTIMONIAL AUTO-SLIDER (7 Seconds) ---
    const slider = document.getElementById('testimonialSlider');

    if (slider) {
        setInterval(() => {
            const containerWidth = slider.offsetWidth;
            const maxScroll = slider.scrollWidth - containerWidth;

            if (slider.scrollLeft >= maxScroll - 10) {
                slider.scrollTo({
                    left: 0,
                    behavior: 'smooth'
                });
            } else {
                slider.scrollBy({
                    left: containerWidth,
                    behavior: 'smooth'
                });
            }
        }, 7000);
    }

    // --- Essential Variable Declarations (Add these at the start of your script) ---
    const tContainer = document.querySelector(".testimonial-carousel-container"); // Assuming a container for the whole component
    const tSlider = document.querySelector(".testimonial-slider"); // Your slide track/wrapper element
    const tCards = document.querySelectorAll(".testimonial-slide"); // All individual cards/slides
    const tDots = document.getElementById("testimonialPagination");
    let tIndex = 0; // Current slide index

    // Determine how many items fit per view (needs to be consistent with your CSS)
    let itemsPerSlide = window.innerWidth < 600 ? 1 : window.innerWidth < 992 ? 3 : 3;
    let totalSlides = Math.ceil(tCards.length / itemsPerSlide);


    // --- Revised Functions ---

    function loadDots() {
        if (!tDots || totalSlides === 0) return;

        tDots.innerHTML = ""; // Clear existing content

        // 1. Create Previous Button (<)
        const prevButton = document.createElement("button");
        prevButton.classList.add("nav-btn", "prev");
        prevButton.innerHTML = "&#10094;"; // HTML entity for '<'
        prevButton.addEventListener("click", () => slideTo(tIndex - 1));
        tDots.appendChild(prevButton);

        // 2. Create Numbered Buttons
        for (let i = 0; i < totalSlides; i++) {
            const dot = document.createElement("button");
            dot.classList.add("dot");
            // Add the number inside the button
            dot.textContent = i + 1;
            dot.addEventListener("click", () => slideTo(i));
            tDots.appendChild(dot);
        }

        // 3. Create Next Button (>)
        const nextButton = document.createElement("button");
        nextButton.classList.add("nav-btn", "next");
        nextButton.innerHTML = "&#10095;"; // HTML entity for '>'
        nextButton.addEventListener("click", () => slideTo(tIndex + 1));
        tDots.appendChild(nextButton);

        updatePagination(); // Initial state update
    }

    function slideTo(newIndex) {
        // Boundary checks
        newIndex = Math.max(0, Math.min(newIndex, totalSlides - 1));

        tIndex = newIndex;

        // Assuming you are moving the whole slider container by the width of one "slide" view.
        if (tSlider) tSlider.style.transform = `translateX(-${tIndex * 100}%)`;

        updatePagination();
    }

    function updatePagination() {
        // Update Active Button
        document.querySelectorAll("#testimonialPagination .dot").forEach((d, i) => {
            d.classList.toggle("active", i === tIndex);
        });

        // Update Arrow button states (e.g., disable at ends)
        const prevBtn = document.querySelector("#testimonialPagination .prev");
        const nextBtn = document.querySelector("#testimonialPagination .next");

        if (prevBtn) prevBtn.disabled = tIndex === 0;
        if (nextBtn) nextBtn.disabled = tIndex === totalSlides - 1;
    }

    // Ensure resize logic calculates and re-renders based on the *new* slide count
    window.addEventListener("resize", () => {
        let newCount = window.innerWidth < 600 ? 1 : window.innerWidth < 992 ? 3 : 3;
        if (newCount !== itemsPerSlide) {
            itemsPerSlide = newCount;
            totalSlides = Math.ceil(tCards.length / itemsPerSlide);
            loadDots();
            // Recalculate and slide to the first card visible in the new viewport
            slideTo(0);
        }
    });


    // Re-select elements inside DOMContentLoaded to ensure they are available
    // (This is a safer place for initial element selection)
    // You should move the initial variable declarations inside here or ensure they run after the DOM is ready.
    // For this example, I'll assume they are defined globally as shown above, but run after DOM ready.
    loadDots();


    // end DOMContentLoaded

    // leftover var from original file (kept to avoid breaking code that expects it)
    let lastLocked = false;

    // ====================== script.js (Visibility Fix) ======================

    /**
     * Handles the browser's tab visibility change event.
     * This actively pauses/unpauses the cloud animation to prevent a stutter
     * when the user switches tabs, overriding browser throttling.
     */
    function handleVisibilityChange() {
        const clouds = document.querySelectorAll('.cloud');

        if (document.hidden) {
            // Tab is now in the background, actively pause the animation using the CSS class
            clouds.forEach(cloud => cloud.classList.add('cloud-pause-fix'));
        } else {
            // Tab is now in focus, actively unpause the animation
            clouds.forEach(cloud => cloud.classList.remove('cloud-pause-fix'));
        }
    }

    // Add the event listener to monitor tab focus
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const startColor = [250, 198, 87]; // #fac657 (RGB values for the start color)
    const endColor = [122, 222, 255];   // #7adeff (RGB values for the end color)
    // Note: We ignore the middle color #eee18b for a simple two-point transition

    function scrollColorChange() {
        // Calculate how far the user has scrolled (0 to 1)
        const scrollPosition = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const scrollRatio = maxScroll > 0 ? scrollPosition / maxScroll : 0;

        // Clamp the ratio between 0 and 1
        const ratio = Math.min(1, Math.max(0, scrollRatio));

        // Interpolate the RGB values based on the scroll ratio
        const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * ratio);
        const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * ratio);
        const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * ratio);

        // Apply the new background color
        document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    }

    // ================== CONTACT FORM ==================

    document.getElementById("ajaxContactForm").addEventListener("submit", function (e) {
        e.preventDefault();

        const form = this;
        const button = document.getElementById("submitBtn");
        const successBox = document.getElementById("formSuccess");

        button.disabled = true;
        button.textContent = "Sending...";

        fetch("http://localhost:3000/api/send-mail", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: form.name.value,
                email: form.email.value,
                phone: form.phone.value,
                message: form.message.value
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {

                    form.style.opacity = "0";
                    form.style.transform = "translateY(-10px)";

                    setTimeout(() => {
                        const card = document.querySelector(".contact-card");

                        form.style.display = "none";
                        card.classList.add("success-mode");
                        successBox.style.display = "flex";
                        successBox.style.opacity = "0";
                        successBox.style.transform = "translateY(10px)";

                        setTimeout(() => {
                            successBox.style.opacity = "1";
                            successBox.style.transform = "translateY(0)";
                        }, 50);

                    }, 300);

                } else {
                    alert(data.message || "Something went wrong.");
                    button.disabled = false;
                    button.textContent = "Send Message";
                }
            })
            .catch(() => {
                alert("Network error. Please try again.");
                button.disabled = false;
                button.textContent = "Send Message";
            });
    });
});