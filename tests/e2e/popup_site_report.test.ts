import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer";
import { packagedExtensionLaunchArgs } from "./chrome_launch";
import { listenOnSafeLocalhost } from "./http_server";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const extensionPath = path.join(projectRoot, "dist").replaceAll("\\", "/");

async function waitForWorker(browser: Browser, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const target = browser
            .targets()
            .find((candidate) => candidate.type() === "service_worker" && candidate.url().endsWith("/js/background.js"));
        const worker = target ? await target.worker() : null;
        if (target && worker) {
            return { target, worker };
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error("ZenithGuard service worker did not load");
}

describe("packaged popup site report", () => {
    it("copies a report for the active web tab from the Tools tab", async () => {
        if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
            throw new Error("Missing dist manifest. Run npm run build before e2e tests.");
        }

        const server = http.createServer((request, response) => {
            response.setHeader("content-type", "text/html; charset=utf-8");
            if (request.url === "/ads.js") {
                response.end("console.log('ad signal');");
                return;
            }

            response.end("<!doctype html><title>Report Test</title><h1>Report Test</h1><script src=\"/ads.js\"></script>");
        });
        await listenOnSafeLocalhost(server);

        const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "zg-popup-report-e2e-"));
        let browser: Browser | null = null;

        try {
            browser = await puppeteer.launch({
                headless: "new",
                userDataDir: profileDir,
                ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
                args: packagedExtensionLaunchArgs(extensionPath),
                defaultViewport: { width: 1365, height: 900 },
            });

            const { target, worker } = await waitForWorker(browser);
            const extensionId = target.url().split("/")[2];
            const port = (server.address() as { port: number }).port;
            const activePage = await browser.newPage();
            await activePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
            await activePage.bringToFront();

            const activeTab = await worker.evaluate(async () => {
                const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                return {
                    id: tab?.id ?? null,
                    url: tab?.url || "",
                };
            });
            expect(activeTab.url).toMatch(`http://127.0.0.1:${port}/`);
            expect(typeof activeTab.id).toBe("number");

            const popupUrl = `chrome-extension://${extensionId}/src/pages/popup.html`;
            const createdTab = await worker.evaluate(async (url) => chrome.tabs.create({ url, active: false }), popupUrl);
            const popupTarget = await browser.waitForTarget((candidate) => candidate.url() === popupUrl, { timeout: 10_000 });
            const popup = await popupTarget.page();
            expect(popup).not.toBeNull();

            await popup!.waitForSelector("button", { timeout: 10_000 });
            expect(await popup!.evaluate(() => document.body.innerText.includes("127.0.0.1"))).toBe(true);

            await popup!.bringToFront();
            const toolsClicked = await popup!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.trim() === "Tools");
                if (!button) {
                    return false;
                }
                button.click();
                return true;
            });
            expect(toolsClicked).toBe(true);

            await popup!.waitForFunction(() => document.body.innerText.includes("Report This Site"), { timeout: 10_000 });
            expect(await popup!.evaluate(() => document.body.innerText.includes("Copy Site Report"))).toBe(true);
            expect(await popup!.evaluate(() => document.body.innerText.includes("Open Logger Review"))).toBe(true);
            expect(await popup!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Copy Review List")) as HTMLButtonElement | undefined;
                return Boolean(button?.disabled);
            })).toBe(true);

            const reportClicked = await popup!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Copy Site Report"));
                if (!button) {
                    return false;
                }
                button.click();
                return true;
            });
            expect(reportClicked).toBe(true);
            await popup!.waitForFunction(() => document.body.innerText.includes("Site Report Copied"), { timeout: 10_000 });

            const activity = await worker.evaluate(async () => chrome.storage.local.get("toolActivityLog"));
            expect(activity.toolActivityLog).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    tool: "Site Report",
                    title: "Site Report Copied",
                }),
            ]));

            const followUpClicked = await popup!.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll("button"));
                const button = buttons.find((candidate) => candidate.textContent?.includes("Open Logger Review"));
                if (!button) {
                    return false;
                }
                button.click();
                return true;
            });
            expect(followUpClicked).toBe(true);

            const loggerTarget = await browser.waitForTarget((candidate) => {
                const url = candidate.url();
                return url.startsWith(`chrome-extension://${extensionId}/src/pages/logger.html`)
                    && url.includes("review=needs-review");
            }, { timeout: 10_000 });
            const loggerUrl = new URL(loggerTarget.url());
            expect(loggerUrl.searchParams.get("tabId")).toBe(String(activeTab.id));
            expect(loggerUrl.searchParams.get("status")).toBe("allowed");
            expect(loggerUrl.searchParams.get("review")).toBe("needs-review");

            if (createdTab.id) {
                await worker.evaluate(async (tabId) => chrome.tabs.remove(tabId).catch(() => {}), createdTab.id);
            }
        } finally {
            await browser?.close().catch(() => {});
            server.close();
            fs.rmSync(profileDir, { recursive: true, force: true });
        }
    }, 45_000);

    it("opens Logger Review directly for the active web tab before copying a report", async () => {
        if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
            throw new Error("Missing dist manifest. Run npm run build before e2e tests.");
        }

        const server = http.createServer((request, response) => {
            response.setHeader("content-type", "text/html; charset=utf-8");
            if (request.url === "/prebid.js") {
                response.end("console.log('prebid signal');");
                return;
            }

            response.end("<!doctype html><title>Logger Review Test</title><h1>Logger Review Test</h1><script src=\"/prebid.js\"></script>");
        });
        await listenOnSafeLocalhost(server);

        const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "zg-popup-review-e2e-"));
        let browser: Browser | null = null;

        try {
            browser = await puppeteer.launch({
                headless: "new",
                userDataDir: profileDir,
                ignoreDefaultArgs: ["--disable-extensions", "--disable-component-extensions-with-background-pages"],
                args: packagedExtensionLaunchArgs(extensionPath),
                defaultViewport: { width: 1365, height: 900 },
            });

            const { target, worker } = await waitForWorker(browser);
            const extensionId = target.url().split("/")[2];
            const port = (server.address() as { port: number }).port;
            const activePage = await browser.newPage();
            await activePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
            await activePage.bringToFront();

            const activeTab = await worker.evaluate(async () => {
                const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                return {
                    id: tab?.id ?? null,
                    url: tab?.url || "",
                };
            });
            expect(activeTab.url).toMatch(`http://127.0.0.1:${port}/`);
            expect(typeof activeTab.id).toBe("number");

            const popupUrl = `chrome-extension://${extensionId}/src/pages/popup.html`;
            const createdTab = await worker.evaluate(async (url) => chrome.tabs.create({ url, active: false }), popupUrl);
            const popupTarget = await browser.waitForTarget((candidate) => candidate.url() === popupUrl, { timeout: 10_000 });
            const popup = await popupTarget.page();
            expect(popup).not.toBeNull();

            await popup!.waitForSelector("button", { timeout: 10_000 });
            await popup!.bringToFront();
            const toolsClicked = await popup!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.trim() === "Tools");
                if (!button) {
                    return false;
                }
                button.click();
                return true;
            });
            expect(toolsClicked).toBe(true);
            await popup!.waitForFunction(() => document.body.innerText.includes("Open Logger Review"), { timeout: 10_000 });

            const reviewClicked = await popup!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Open Logger Review"));
                if (!button) {
                    return false;
                }
                button.click();
                return true;
            });
            expect(reviewClicked).toBe(true);

            const loggerTarget = await browser.waitForTarget((candidate) => {
                const url = candidate.url();
                return url.startsWith(`chrome-extension://${extensionId}/src/pages/logger.html`)
                    && url.includes("review=needs-review");
            }, { timeout: 10_000 });
            const loggerUrl = new URL(loggerTarget.url());

            expect(loggerUrl.searchParams.get("tabId")).toBe(String(activeTab.id));
            expect(loggerUrl.searchParams.get("status")).toBe("allowed");
            expect(loggerUrl.searchParams.get("review")).toBe("needs-review");

            if (createdTab.id) {
                await worker.evaluate(async (tabId) => chrome.tabs.remove(tabId).catch(() => {}), createdTab.id);
            }
        } finally {
            await browser?.close().catch(() => {});
            server.close();
            fs.rmSync(profileDir, { recursive: true, force: true });
        }
    }, 45_000);

});
