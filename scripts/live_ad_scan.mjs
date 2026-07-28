import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";

const rootDir = process.cwd();
const defaultDurationMs = 15_000;
const adSignalPatterns = [
    /(^|[./_-])ad(s|server|service|tech|unit|vert|x)?([./_-]|$)/i,
    /adUnit=|bidderId=|impId=|prebid|gampad|pubads|vast|vpaid|ima3?|outstream|instream|preroll|midroll/i,
    /doubleclick|googlesyndication|googletagservices|criteo|rubicon|pubmatic|adnxs|openx|taboola|outbrain/i,
    /scorecardresearch|analytics\.yahoo|bing\.com\/api\/v1\/mediation\/tracking/i,
];

function parseArgs(argv) {
    const options = {
        distDir: "dist",
        durationMs: defaultDurationMs,
        headless: false,
        scroll: false,
        url: null,
    };

    for (const arg of argv) {
        if (arg.startsWith("--dist=")) {
            options.distDir = arg.slice("--dist=".length) || options.distDir;
        } else if (arg.startsWith("--duration=")) {
            const parsed = Number(arg.slice("--duration=".length));
            if (Number.isFinite(parsed) && parsed > 0) {
                options.durationMs = parsed;
            }
        } else if (arg === "--headless") {
            options.headless = "new";
        } else if (arg === "--scroll") {
            options.scroll = true;
        } else if (!arg.startsWith("--") && !options.url) {
            options.url = arg;
        }
    }

    return options;
}

function normalizeExtensionPath(distDir) {
    return path.resolve(rootDir, distDir).replaceAll("\\", "/");
}

function requireDist(extensionPath) {
    const manifestPath = path.join(extensionPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Missing built extension manifest: ${manifestPath}. Run npm run build first.`);
    }
}

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return "(invalid)";
    }
}

function isHttpUrl(url) {
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

function isAdSignal(url) {
    return isHttpUrl(url) && adSignalPatterns.some((pattern) => pattern.test(url));
}

function summarizeCounts(items, getKey) {
    const counts = new Map();
    for (const item of items) {
        const key = getKey(item);
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, count }));
}

async function waitForZenithGuardWorker(browser, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const workerTarget = browser
            .targets()
            .find((target) => target.type() === "service_worker" && target.url().endsWith("/js/background.js"));
        if (workerTarget) {
            const worker = await workerTarget.worker();
            if (worker) {
                return { workerTarget, worker };
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(
        "ZenithGuard service worker did not load. Use Puppeteer's bundled Chrome-for-Testing or another Chromium build that allows --load-extension.",
    );
}

async function getRuntimeState(worker) {
    return worker.evaluate(async () => ({
        enabledRulesets: await chrome.declarativeNetRequest.getEnabledRulesets(),
        dynamicRuleCount: (await chrome.declarativeNetRequest.getDynamicRules()).length,
        storage: await chrome.storage.sync.get(["settingsInitialized", "isProtectionEnabled", "protectionPausedUntil"]),
    }));
}

async function scrollPage(page) {
    await page.evaluate(async () => {
        const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const steps = 4;
        for (let step = 1; step <= steps; step += 1) {
            window.scrollTo({ top: Math.floor((maxScroll * step) / steps), behavior: "instant" });
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options.url) {
        console.error("Usage: npm run scan:live -- <url> [--duration=15000] [--scroll] [--dist=dist] [--headless]");
        process.exit(1);
    }

    const extensionPath = normalizeExtensionPath(options.distDir);
    requireDist(extensionPath);

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "zg-live-scan-"));
    const requests = [];
    const responses = [];
    const failed = [];

    const browser = await puppeteer.launch({
        headless: options.headless,
        userDataDir: profileDir,
        ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=Translate,OptimizationHints",
            "--window-size=1365,900",
        ],
        defaultViewport: { width: 1365, height: 900 },
    });

    try {
        const { workerTarget, worker } = await waitForZenithGuardWorker(browser);
        const extensionId = workerTarget.url().split("/")[2] || null;
        const beforeState = await getRuntimeState(worker);

        const page = await browser.newPage();
        page.on("request", (request) => {
            requests.push({
                type: request.resourceType(),
                url: request.url(),
                host: hostnameFromUrl(request.url()),
                adSignal: isAdSignal(request.url()),
            });
        });
        page.on("response", (response) => {
            responses.push({
                status: response.status(),
                url: response.url(),
                host: hostnameFromUrl(response.url()),
                adSignal: isAdSignal(response.url()),
            });
        });
        page.on("requestfailed", (request) => {
            failed.push({
                type: request.resourceType(),
                failure: request.failure()?.errorText || "unknown",
                url: request.url(),
                host: hostnameFromUrl(request.url()),
                adSignal: isAdSignal(request.url()),
            });
        });

        await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        if (options.scroll) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, options.durationMs)));
            await scrollPage(page);
        }
        await new Promise((resolve) => setTimeout(resolve, options.durationMs));

        const afterState = await getRuntimeState(worker);
        const blocked = failed.filter((entry) => entry.failure === "net::ERR_BLOCKED_BY_CLIENT");
        const allowedSignals = responses.filter((entry) => entry.adSignal && entry.status < 400);

        console.log(
            JSON.stringify(
                {
                    target: options.url,
                    executable: puppeteer.executablePath(),
                    extensionId,
                    extensionPath,
                    beforeState,
                    afterState,
                    totals: {
                        requests: requests.length,
                        responses: responses.length,
                        failed: failed.length,
                        blockedByClient: blocked.length,
                        allowedAdSignals: allowedSignals.length,
                    },
                    blockedHosts: summarizeCounts(blocked, (entry) => entry.host).slice(0, 25),
                    allowedAdSignalHosts: summarizeCounts(allowedSignals, (entry) => entry.host).slice(0, 25),
                    allowedAdSignalSamples: allowedSignals.slice(0, 25),
                    blockedSamples: blocked.slice(0, 25),
                },
                null,
                2,
            ),
        );
    } finally {
        await browser.close();
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
