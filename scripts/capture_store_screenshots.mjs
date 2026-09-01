import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = path.join(projectRoot, "dist").replaceAll("\\", "/");
const outputDir = path.join(projectRoot, "store-assets");
const rawDir = path.join(outputDir, "raw");
const screenshotDir = path.join(outputDir, "screenshots");
const promoDir = path.join(outputDir, "promo");
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "zg-store-assets-"));
const iconData = fs.readFileSync(path.join(projectRoot, "icons", "icon128.png")).toString("base64");

fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(promoDir, { recursive: true });

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
}

async function waitForWorker(browser, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const target = browser.targets().find((candidate) => candidate.type() === "service_worker"
            && candidate.url().endsWith("/js/background.js"));
        const worker = target ? await target.worker() : null;
        if (target && worker) {
            return { target, worker };
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("ZenithGuard service worker did not load");
}

async function openExtensionPage(browser, worker, extensionId, relativeUrl, viewport) {
    const url = `chrome-extension://${extensionId}/${relativeUrl}`;
    await worker.evaluate(async (pageUrl) => chrome.tabs.create({ url: pageUrl, active: false }), url);
    const target = await browser.waitForTarget((candidate) => candidate.url() === url, { timeout: 10_000 });
    const page = await target.page();
    if (!page) {
        throw new Error(`Could not open ${relativeUrl}`);
    }
    await page.setViewport(viewport);
    await page.bringToFront();
    await page.waitForFunction(() => document.readyState === "complete" && document.body.innerText.trim().length > 20, {
        timeout: 10_000,
    });
    return page;
}

async function captureRaw(page, name) {
    const outputPath = path.join(rawDir, `${name}.png`);
    await page.screenshot({ path: outputPath, type: "png", omitBackground: false });
    return outputPath;
}

function imageDataUrl(imagePath) {
    return `data:image/png;base64,${fs.readFileSync(imagePath).toString("base64")}`;
}

async function compose(browser, definition) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    const productImage = imageDataUrl(definition.imagePath);
    const chips = definition.chips.map((chip) => `<span>${chip}</span>`).join("");
    const productClass = definition.layout === "popup" ? "product popup-product" : "product wide-product";

    await page.setContent(`<!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                * { box-sizing: border-box; }
                html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
                body {
                    color: #f8fafc;
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    background:
                        radial-gradient(circle at 79% 24%, rgba(34, 211, 238, .20), transparent 28%),
                        radial-gradient(circle at 12% 88%, rgba(99, 102, 241, .20), transparent 34%),
                        linear-gradient(135deg, #030712 0%, #071426 52%, #0b1020 100%);
                }
                body::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    opacity: .16;
                    background-image:
                        linear-gradient(rgba(148, 163, 184, .18) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(148, 163, 184, .18) 1px, transparent 1px);
                    background-size: 40px 40px;
                    mask-image: linear-gradient(to bottom, black, transparent 82%);
                }
                .brand {
                    position: fixed;
                    top: 44px;
                    left: 64px;
                    z-index: 3;
                    display: flex;
                    align-items: center;
                    gap: 13px;
                    font-size: 21px;
                    font-weight: 800;
                    letter-spacing: -.03em;
                }
                .brand img { width: 38px; height: 38px; filter: drop-shadow(0 0 14px rgba(34,211,238,.5)); }
                .wide-layout .brand { display: none; }
                .copy {
                    position: absolute;
                    z-index: 3;
                }
                .popup-layout .copy { left: 66px; top: 190px; width: 560px; }
                .wide-layout .copy { left: 66px; top: 105px; width: 1140px; text-align: center; }
                .eyebrow {
                    color: #67e8f9;
                    font-size: 15px;
                    font-weight: 800;
                    letter-spacing: .15em;
                    text-transform: uppercase;
                    margin-bottom: 15px;
                }
                h1 {
                    margin: 0;
                    max-width: 680px;
                    font-size: 58px;
                    line-height: 1.02;
                    letter-spacing: -.055em;
                    text-wrap: balance;
                }
                .wide-layout h1 { margin: 0 auto; max-width: 1000px; font-size: 46px; }
                p {
                    color: #cbd5e1;
                    margin: 22px 0 0;
                    max-width: 555px;
                    font-size: 22px;
                    line-height: 1.5;
                    text-wrap: balance;
                }
                .wide-layout p { margin: 10px auto 0; max-width: 900px; font-size: 19px; }
                .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
                .wide-layout .chips { justify-content: center; margin-top: 15px; }
                .chips span {
                    padding: 9px 14px;
                    border: 1px solid rgba(103, 232, 249, .25);
                    border-radius: 999px;
                    color: #cffafe;
                    background: rgba(8, 47, 73, .55);
                    font-size: 13px;
                    font-weight: 750;
                    box-shadow: inset 0 1px rgba(255,255,255,.06);
                }
                .product {
                    position: absolute;
                    z-index: 2;
                    overflow: hidden;
                    border: 1px solid rgba(148, 163, 184, .28);
                    background: #020617;
                    box-shadow: 0 30px 80px rgba(0,0,0,.48), 0 0 70px rgba(34,211,238,.10);
                }
                .popup-product {
                    right: 118px;
                    top: 104px;
                    width: 360px;
                    height: 600px;
                    border-radius: 25px;
                }
                .wide-product {
                    left: 55px;
                    top: 244px;
                    width: 1170px;
                    height: 520px;
                    border-radius: 22px;
                    padding-top: 35px;
                }
                .wide-product::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 35px;
                    border-bottom: 1px solid rgba(148,163,184,.18);
                    background: rgba(15,23,42,.95);
                    z-index: 2;
                }
                .wide-product::after {
                    content: "●  ●  ●";
                    position: absolute;
                    top: 8px;
                    left: 15px;
                    color: #475569;
                    letter-spacing: 3px;
                    z-index: 3;
                    font-size: 12px;
                }
                .product img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: top; }
                .wide-product img { height: calc(100% - 35px); object-position: top; }
                .accent-line {
                    position: absolute;
                    z-index: 1;
                    width: 380px;
                    height: 380px;
                    border: 1px solid rgba(34,211,238,.12);
                    border-radius: 50%;
                    right: 106px;
                    top: 210px;
                    box-shadow: 0 0 80px rgba(34,211,238,.08);
                    transform: scale(1.55);
                }
            </style>
        </head>
        <body class="${definition.layout}-layout">
            <div class="brand"><img src="data:image/png;base64,${iconData}" alt=""><span>ZenithGuard</span></div>
            <div class="copy">
                <div class="eyebrow">${definition.eyebrow}</div>
                <h1>${definition.headline}</h1>
                <p>${definition.body}</p>
                <div class="chips">${chips}</div>
            </div>
            <div class="accent-line"></div>
            <div class="${productClass}"><img src="${productImage}" alt=""></div>
        </body>
        </html>`, { waitUntil: "load" });

    await page.evaluate(async () => {
        await Promise.all(Array.from(document.images).map((image) => image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
            })));
        window.scrollTo(0, 0);
    });

    const outputPath = path.join(screenshotDir, definition.fileName);
    await page.screenshot({ path: outputPath, type: "png", omitBackground: false });
    await page.close();
    return outputPath;
}

async function composePromoAssets(browser, popupImagePath) {
    const popupImage = imageDataUrl(popupImagePath);
    const sharedBackground = `
        background:
            radial-gradient(circle at 78% 22%, rgba(34, 211, 238, .23), transparent 29%),
            radial-gradient(circle at 10% 92%, rgba(99, 102, 241, .22), transparent 34%),
            linear-gradient(135deg, #030712 0%, #071426 52%, #0b1020 100%);`;

    const small = await browser.newPage();
    await small.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
    await small.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
        body { position: relative; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; ${sharedBackground} }
        body::before { content: ""; position: absolute; inset: 0; opacity: .13; background-image: linear-gradient(rgba(148,163,184,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.22) 1px,transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(to bottom,black,transparent 90%); }
        .orb { position: absolute; width: 220px; height: 220px; border-radius: 50%; border: 1px solid rgba(34,211,238,.15); right: -62px; top: 10px; box-shadow: 0 0 70px rgba(34,211,238,.11); }
        main { position: relative; z-index: 2; height: 100%; padding: 27px 32px 25px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .brand { display: flex; align-items: center; gap: 10px; font-size: 23px; font-weight: 850; letter-spacing: -.035em; }
        .brand img { width: 42px; height: 42px; filter: drop-shadow(0 0 15px rgba(34,211,238,.58)); }
        .kicker { margin-top: 25px; color: #67e8f9; font-size: 11px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
        h1 { margin: 7px 0 0; font-size: 35px; line-height: 1.02; letter-spacing: -.052em; }
        .features { margin-top: auto; display: flex; gap: 8px; }
        .features span { padding: 8px 12px; border: 1px solid rgba(103,232,249,.25); border-radius: 999px; color: #cffafe; background: rgba(8,47,73,.58); font-size: 11px; font-weight: 750; }
    </style></head><body><div class="orb"></div><main>
        <div class="brand"><img src="data:image/png;base64,${iconData}" alt=""><span>ZenithGuard</span></div>
        <div class="kicker">Privacy protection</div>
        <h1>Block. Inspect. Control.</h1>
        <div class="features"><span>Ads</span><span>Trackers</span><span>Threats</span></div>
    </main></body></html>`, { waitUntil: "load" });
    await small.evaluate(() => Promise.all(Array.from(document.images).map((image) => image.decode())));
    const smallPath = path.join(promoDir, "small-promo-tile-440x280.png");
    await small.screenshot({ path: smallPath, type: "png", omitBackground: false });
    await small.close();

    const marquee = await browser.newPage();
    await marquee.setViewport({ width: 1400, height: 560, deviceScaleFactor: 1 });
    await marquee.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 1400px; height: 560px; overflow: hidden; }
        body { position: relative; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; ${sharedBackground} }
        body::before { content: ""; position: absolute; inset: 0; opacity: .14; background-image: linear-gradient(rgba(148,163,184,.20) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.20) 1px,transparent 1px); background-size: 38px 38px; mask-image: linear-gradient(to right,black,transparent 86%); }
        .orb { position: absolute; width: 610px; height: 610px; border-radius: 50%; border: 1px solid rgba(34,211,238,.14); right: 52px; top: -24px; box-shadow: 0 0 100px rgba(34,211,238,.10); }
        .copy { position: absolute; z-index: 2; left: 72px; top: 54px; width: 760px; }
        .brand { display: flex; align-items: center; gap: 13px; font-size: 23px; font-weight: 850; letter-spacing: -.035em; }
        .brand img { width: 42px; height: 42px; filter: drop-shadow(0 0 16px rgba(34,211,238,.55)); }
        .kicker { margin-top: 66px; color: #67e8f9; font-size: 15px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
        h1 { margin: 13px 0 0; max-width: 760px; font-size: 61px; line-height: 1.01; letter-spacing: -.055em; text-wrap: balance; }
        p { margin: 18px 0 0; color: #cbd5e1; max-width: 690px; font-size: 21px; line-height: 1.45; }
        .features { display: flex; gap: 10px; margin-top: 25px; }
        .features span { padding: 9px 14px; border: 1px solid rgba(103,232,249,.25); border-radius: 999px; color: #cffafe; background: rgba(8,47,73,.58); font-size: 13px; font-weight: 750; }
        .product { position: absolute; z-index: 2; right: 94px; top: 20px; width: 312px; height: 520px; overflow: hidden; border-radius: 24px; border: 1px solid rgba(148,163,184,.30); background: #020617; box-shadow: 0 30px 80px rgba(0,0,0,.50), 0 0 80px rgba(34,211,238,.12); }
        .product img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: top; }
    </style></head><body><div class="orb"></div>
        <section class="copy">
            <div class="brand"><img src="data:image/png;base64,${iconData}" alt=""><span>ZenithGuard</span></div>
            <div class="kicker">Privacy protection, made visible</div>
            <h1>A clearer way to block the web.</h1>
            <p>Stop ads, trackers, and suspicious requests—then see exactly what happened.</p>
            <div class="features"><span>Live protection</span><span>Site insights</span><span>Network logger</span></div>
        </section>
        <div class="product"><img src="${popupImage}" alt=""></div>
    </body></html>`, { waitUntil: "load" });
    await marquee.evaluate(() => Promise.all(Array.from(document.images).map((image) => image.decode())));
    const marqueePath = path.join(promoDir, "marquee-promo-tile-1400x560.png");
    await marquee.screenshot({ path: marqueePath, type: "png", omitBackground: false });
    await marquee.close();

    return [smallPath, marqueePath];
}

const server = http.createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    if (request.url !== "/") {
        response.setHeader("content-type", request.url?.endsWith(".js") ? "text/javascript" : "image/svg+xml");
        response.end(request.url?.endsWith(".js")
            ? "window.__zenithDemoLoaded = true;"
            : '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#0ea5e9"/></svg>');
        return;
    }

    const port = server.address().port;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
        <html>
        <head><title>Privacy Daily — Technology</title></head>
        <body>
            <main><h1>Privacy Daily</h1><p>Independent technology and privacy reporting.</p></main>
            <script src="http://privacy-cdn.test:${port}/app.js"></script>
            <script src="http://doubleclick.net:${port}/display-ad.js"></script>
            <script src="http://session-replay.example:${port}/recorder.js"></script>
            <img src="http://image-cdn.test:${port}/hero.svg?utm_source=launch" alt="">
            <script>
                fetch("http://metrics.example:${port}/collect?v=2").catch(() => {});
                fetch("http://trusted-api.test:${port}/headlines").catch(() => {});
            </script>
        </body>
        </html>`);
});

let browser;
try {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
        throw new Error("Missing dist manifest. Run npm run build first.");
    }

    await listen(server);
    const port = server.address().port;
    browser = await puppeteer.launch({
        headless: true,
        userDataDir: profileDir,
        ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=Translate,OptimizationHints",
            "--host-resolver-rules=MAP privacy-daily.test 127.0.0.1, MAP privacy-cdn.test 127.0.0.1, MAP image-cdn.test 127.0.0.1, MAP trusted-api.test 127.0.0.1, MAP doubleclick.net 127.0.0.1, MAP session-replay.example 127.0.0.1, MAP metrics.example 127.0.0.1",
        ],
        defaultViewport: { width: 1280, height: 720 },
    });

    const { target, worker } = await waitForWorker(browser);
    const extensionId = target.url().split("/")[2];
    await worker.evaluate(async () => {
        const hostname = "privacy-daily.test";
        const now = Date.now();
        await Promise.all([
            chrome.storage.sync.set({
                isProtectionEnabled: true,
                isHeuristicEngineEnabled: true,
                isMalwareProtectionEnabled: true,
                isUrlCleanerEnabled: true,
                isNextGenAIEradicatorEnabled: true,
                disabledSites: [],
                isolationModeSites: [],
                forgetfulSites: [],
                networkBlocklist: [
                    { value: "metrics.example", enabled: true },
                    { value: "session-replay.example", enabled: true },
                    { value: "ads.example", enabled: true },
                ],
            }),
            chrome.storage.local.set({
                networkBlocklistMeta: {
                    "metrics.example": { source: "logger", addedAt: now - 45_000 },
                    "session-replay.example": { source: "analyzer", addedAt: now - 120_000 },
                    "ads.example": { source: "settings", addedAt: now - 300_000 },
                },
                toolActivityLog: [
                    { tool: "Cosmetic Cleanup", title: "Ad Shells Cleaned", message: "Collapsed 8 leftover ad shells after blocking.", tone: "success", timestamp: now - 25_000, domain: hostname },
                    { tool: "Fix Cookies", title: "Cookie Banner Handled", message: "Applied the preferred consent choice.", tone: "success", timestamp: now - 90_000, domain: hostname },
                    { tool: "Site Report", title: "Site Report Ready", message: "Prepared a redacted review package.", tone: "info", timestamp: now - 180_000, domain: hostname },
                ],
                cosmeticCleanupSummaryByHostname: {
                    [hostname]: { count: 8, latestHint: "aside.sponsored-slot", updatedAt: now - 25_000, pageUrl: `http://${hostname}/` },
                },
            }),
        ]);
    });

    await new Promise((resolve) => setTimeout(resolve, 800));
    const demoPage = await browser.newPage();
    await demoPage.goto(`http://privacy-daily.test:${port}/`, { waitUntil: "networkidle0", timeout: 15_000 });
    await demoPage.bringToFront();

    const activeTab = await worker.evaluate(async () => {
        const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        return { id: tab?.id ?? null, url: tab?.url || "" };
    });
    if (typeof activeTab.id !== "number") {
        throw new Error("Could not resolve the demo tab");
    }

    const popup = await openExtensionPage(browser, worker, extensionId, "src/pages/popup.html", { width: 360, height: 600 });
    await popup.waitForFunction(() => document.body.innerText.includes("privacy-daily.test"), { timeout: 10_000 });
    const popupHome = await captureRaw(popup, "popup-home");

    await popup.evaluate(() => Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Insights")?.click());
    await popup.waitForFunction(() => document.body.innerText.includes("Protection Snapshot"), { timeout: 10_000 });
    const popupInsights = await captureRaw(popup, "popup-insights");

    await popup.evaluate(() => Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Tools")?.click());
    await popup.waitForFunction(() => document.body.innerText.includes("Page Actions"), { timeout: 10_000 });
    await popup.evaluate(() => Array.from(document.querySelectorAll("h3"))
        .find((heading) => heading.textContent?.trim() === "Page Actions")?.scrollIntoView({ block: "start" }));
    const popupTools = await captureRaw(popup, "popup-tools");

    const logger = await openExtensionPage(
        browser,
        worker,
        extensionId,
        `src/pages/logger.html?tabId=${activeTab.id}`,
        { width: 1280, height: 720 },
    );
    await logger.waitForFunction(() => document.body.innerText.includes("doubleclick.net")
        || document.body.innerText.includes("privacy-cdn.test"), { timeout: 10_000 });
    const loggerShot = await captureRaw(logger, "logger");

    const settings = await openExtensionPage(
        browser,
        worker,
        extensionId,
        "src/pages/settings.html?section=my-rules",
        { width: 1280, height: 720 },
    );
    await settings.waitForFunction(() => document.body.innerText.includes("Network Blocklist"), { timeout: 10_000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settings.evaluate(() => {
        const main = document.querySelector(".main-content");
        const heading = document.querySelector("#network-blocklist-rules");
        if (main instanceof HTMLElement && heading instanceof HTMLElement) {
            main.style.scrollBehavior = "auto";
            main.scrollTop = Math.max(0, heading.offsetTop - 22);
        }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const settingsShot = await captureRaw(settings, "settings-rules");

    const definitions = [
        {
            fileName: "01-protection-you-can-see.png",
            layout: "popup",
            imagePath: popupHome,
            eyebrow: "Privacy protection, made visible",
            headline: "Protection you can actually see.",
            body: "Live site status and one-click controls without digging through complicated menus.",
            chips: ["Ad blocking", "Tracker defense", "Malware protection"],
        },
        {
            fileName: "02-site-insights.png",
            layout: "popup",
            imagePath: popupInsights,
            eyebrow: "Clear site insights",
            headline: "Know what each site is doing.",
            body: "See blocker mix, top sources, and noteworthy requests at a glance.",
            chips: ["Live activity", "Blocker mix", "Review candidates"],
        },
        {
            fileName: "03-network-logger.png",
            layout: "wide",
            imagePath: loggerShot,
            eyebrow: "Transparent by design",
            headline: "Audit every network request.",
            body: "Review blocked, cleaned, and allowed traffic—and turn findings into your own rules.",
            chips: ["Blocked", "Cleaned", "Allowed", "Rule coverage"],
        },
        {
            fileName: "04-your-rules.png",
            layout: "wide",
            imagePath: settingsShot,
            eyebrow: "Fine-grained control",
            headline: "Your rules. Your browser.",
            body: "Manage custom blocks, trusted sites, hidden elements, and privacy controls in one place.",
            chips: ["Custom blocks", "Site policies", "Hidden elements"],
        },
        {
            fileName: "05-page-tools.png",
            layout: "popup",
            imagePath: popupTools,
            eyebrow: "Practical page tools",
            headline: "Fix intrusive pages in seconds.",
            body: "Inspect, zap, report, and repair page problems without leaving the site.",
            chips: ["Zapper", "Inspector", "Site reports"],
        },
    ];

    for (const definition of definitions) {
        const outputPath = await compose(browser, definition);
        console.log(`Created ${outputPath}`);
    }

    const promoAssets = await composePromoAssets(browser, popupHome);
    for (const outputPath of promoAssets) {
        console.log(`Created ${outputPath}`);
    }
} finally {
    await browser?.close().catch(() => {});
    server.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
}
