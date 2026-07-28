import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer";
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

describe("packaged Logger to Settings workflow", () => {
    it("bulk-adds Logger review filters and exposes them through the Settings origin filter", async () => {
        if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
            throw new Error("Missing dist manifest. Run npm run build before e2e tests.");
        }

        const pageServer = http.createServer((_request, response) => {
            response.setHeader("content-type", "text/html; charset=utf-8");
            response.end([
                "<!doctype html>",
                "<title>Logger Settings Workflow</title>",
                "<h1>Logger Settings Workflow</h1>",
            ].join(""));
        });

        await listenOnSafeLocalhost(pageServer);

        const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "zg-logger-settings-e2e-"));
        let browser: Browser | null = null;

        try {
            browser = await puppeteer.launch({
                headless: "new",
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

            const { target, worker } = await waitForWorker(browser);
            const extensionId = target.url().split("/")[2];
            const pagePort = (pageServer.address() as { port: number }).port;

            const activePage = await browser.newPage();
            await activePage.goto(`http://127.0.0.1:${pagePort}/`, { waitUntil: "networkidle0", timeout: 15_000 });
            await activePage.bringToFront();

            const activeTab = await worker.evaluate(async () => {
                const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                return {
                    id: tab?.id ?? null,
                    url: tab?.url || "",
                };
            });
            expect(activeTab.url).toMatch(`http://127.0.0.1:${pagePort}/`);
            expect(typeof activeTab.id).toBe("number");

            const loggerUrl = `chrome-extension://${extensionId}/src/pages/logger.html?tabId=${activeTab.id}&status=allowed&review=needs-review`;
            const loggerTab = await worker.evaluate(async (url) => chrome.tabs.create({ url, active: true }), loggerUrl);
            const loggerTarget = await browser.waitForTarget((candidate) => candidate.url() === loggerUrl, { timeout: 10_000 });
            const logger = await loggerTarget.page();
            expect(logger).not.toBeNull();
            await logger!.waitForFunction(() => document.body.innerText.includes("Network Interceptor Log"), { timeout: 10_000 });

            await logger!.evaluate((tabId, initiator) => {
                (chrome.runtime.onMessage as unknown as { dispatch: (message: unknown) => void }).dispatch({
                    type: "NETWORK_LOG_UPDATE",
                    tabId,
                    log: {
                        id: 9001,
                        url: "https://ads.e2e.test/reviewable.js?slot=top",
                        type: "script",
                        initiator,
                        timestamp: Date.now(),
                        status: "allowed",
                    },
                });
            }, activeTab.id, activeTab.url);

            await logger!.waitForFunction(() => document.body.innerText.includes("ads.e2e.test"), { timeout: 10_000 });
            await logger!.waitForFunction(() => document.body.innerText.includes("Add 1 Filter"), { timeout: 10_000 });

            const manageSettingsUrl = `chrome-extension://${extensionId}/src/pages/settings.html?section=my-rules&domain=ads.e2e.test&focus=network-blocklist`;
            const manageSettingsTargetPromise = browser.waitForTarget((candidate) => candidate.url() === manageSettingsUrl, { timeout: 10_000 });
            const manageClicked = await logger!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Manage in My Rules")) as HTMLButtonElement | undefined;
                button?.click();
                return Boolean(button);
            });
            expect(manageClicked).toBe(true);
            const manageSettingsTarget = await manageSettingsTargetPromise;
            const manageSettings = await manageSettingsTarget.page();
            expect(manageSettings).not.toBeNull();
            await manageSettings!.waitForFunction(() => {
                const search = document.querySelector("input[placeholder='Search custom network blocks']") as HTMLInputElement | null;
                const table = document.getElementById("network-blocklist-rules");
                const top = table?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
                return search?.value === "ads.e2e.test" && top >= 0 && top < window.innerHeight;
            }, { timeout: 10_000 });
            await manageSettings!.close();
            await logger!.bringToFront();

            const firstAddClick = await logger!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Add 1 Filter")) as HTMLButtonElement | undefined;
                button?.click();
                return Boolean(button);
            });
            expect(firstAddClick).toBe(true);
            await logger!.waitForFunction(() => document.body.innerText.includes("Confirm Add 1 Filter"), { timeout: 10_000 });

            const confirmAddClick = await logger!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Confirm Add 1 Filter")) as HTMLButtonElement | undefined;
                button?.click();
                return Boolean(button);
            });
            expect(confirmAddClick).toBe(true);
            await logger!.waitForFunction(() => document.body.innerText.includes("Added 1 new filter."), { timeout: 10_000 });

            const storedAfterAdd = await worker.evaluate(async () => {
                const [syncSnapshot, localSnapshot] = await Promise.all([
                    chrome.storage.sync.get("networkBlocklist"),
                    chrome.storage.local.get("networkBlocklistMeta"),
                ]);
                return { syncSnapshot, localSnapshot };
            });
            expect(storedAfterAdd.syncSnapshot.networkBlocklist).toEqual(expect.arrayContaining([
                expect.objectContaining({ value: "ads.e2e.test", enabled: true }),
            ]));
            expect(storedAfterAdd.localSnapshot.networkBlocklistMeta).toEqual(expect.objectContaining({
                "ads.e2e.test": expect.objectContaining({ source: "logger" }),
            }));

            const settingsUrl = manageSettingsUrl;
            await worker.evaluate(async (url) => chrome.tabs.create({ url, active: true }), settingsUrl);
            const settingsTarget = await browser.waitForTarget((candidate) => candidate.url() === settingsUrl, { timeout: 10_000 });
            const settings = await settingsTarget.page();
            expect(settings).not.toBeNull();

            await settings!.waitForFunction(() => document.body.innerText.includes("Network Blocklist"), { timeout: 10_000 });
            await settings!.select("select[aria-label='Filter custom network blocks by origin']", "logger");
            await settings!.waitForFunction(() => document.body.innerText.includes("ads.e2e.test"), { timeout: 10_000 });
            expect(await settings!.evaluate(() => document.body.innerText.includes("Added from Logger"))).toBe(true);

            await logger!.bringToFront();
            const undoClicked = await logger!.evaluate(() => {
                const button = Array.from(document.querySelectorAll("button"))
                    .find((candidate) => candidate.textContent?.includes("Undo last add")) as HTMLButtonElement | undefined;
                button?.click();
                return Boolean(button);
            });
            expect(undoClicked).toBe(true);
            await logger!.waitForFunction(() => document.body.innerText.includes("Removed 1 filter."), { timeout: 10_000 });

            const storedAfterUndo = await worker.evaluate(async () => {
                const [syncSnapshot, localSnapshot] = await Promise.all([
                    chrome.storage.sync.get("networkBlocklist"),
                    chrome.storage.local.get("networkBlocklistMeta"),
                ]);
                return { syncSnapshot, localSnapshot };
            });
            expect(storedAfterUndo.syncSnapshot.networkBlocklist || []).not.toEqual(expect.arrayContaining([
                expect.objectContaining({ value: "ads.e2e.test" }),
            ]));
            expect(storedAfterUndo.localSnapshot.networkBlocklistMeta || {}).not.toHaveProperty("ads.e2e.test");

            if (loggerTab.id) {
                await worker.evaluate(async (tabId) => chrome.tabs.remove(tabId).catch(() => {}), loggerTab.id);
            }
        } finally {
            await browser?.close().catch(() => {});
            pageServer.close();
            fs.rmSync(profileDir, { recursive: true, force: true });
        }
    }, 60_000);
});
