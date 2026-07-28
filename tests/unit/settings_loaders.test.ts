import { jest } from "@jest/globals";
import { getDefaultBlocklistEntries } from "../../src/js/background/modules/storage/defaults";

const getLocal = jest.fn<any>();
const getSync = jest.fn<any>();
const removeLocal = jest.fn<any>();
const setLocal = jest.fn<any>();
const setSync = jest.fn<any>();
const getSession = jest.fn<any>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSession,
    getSync,
    removeLocal,
    setLocal,
    setSync,
}));

const { loadDashboardSnapshot, loadExtensionHealthSnapshot, loadMalwareFeedStatus, loadRulesSnapshot, loadSettingsSnapshot } = await import("../../src/ui/settings/loaders");

describe("settings loaders", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSession.mockReset();
        getSync.mockReset();
        (globalThis as { chrome?: typeof chrome }).chrome = {
            declarativeNetRequest: {
                getEnabledRulesets: jest.fn(async () => ["core_protection", "youtube_core"]),
                getDynamicRules: jest.fn(async () => [{ id: 100 }, { id: 101 }]),
            },
            runtime: {
                id: "extension-id",
                getManifest: jest.fn(() => ({ version: "3.2.2" })),
            },
        } as unknown as typeof chrome;
    });

    it("loads the global protection master switch into the settings snapshot", async () => {
        getSync.mockResolvedValueOnce({
            isProtectionEnabled: false,
            theme: "dark",
        });

        const snapshot = await loadSettingsSnapshot();

        expect(snapshot.isProtectionEnabled).toBe(false);
    });

    it("builds an honest dashboard snapshot from today's activity and enabled rule counts", async () => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).getTime();
        const yesterday = today - 24 * 60 * 60 * 1000;
        const defaultBlocklist = getDefaultBlocklistEntries();

        getSync.mockResolvedValueOnce({
            defaultBlocklist: [
                { ...defaultBlocklist[0], enabled: false },
            ],
            networkBlocklist: [
                { value: "tracker.example.com", enabled: true },
                { value: "pixel.example.com", enabled: false },
            ],
            isolationModeSites: [],
            forgetfulSites: [],
            focusBlocklist: [],
            heuristicKeywords: [],
            customHidingRules: {},
            persistentWallFixes: {},
            disabledSites: [],
        });
        getLocal
            .mockResolvedValueOnce({
                networkBlocklistMeta: {},
                malwareDomainCache: undefined,
            })
            .mockResolvedValueOnce({
                toolActivityLog: [
                    { timestamp: today },
                    { timestamp: today + 1000 },
                    { timestamp: yesterday },
                    { timestamp: undefined },
                ],
            });

        const snapshot = await loadDashboardSnapshot();

        expect(snapshot).toEqual({
            toolActivityToday: 2,
            customNetworkRules: 1,
            enabledCoreRules: defaultBlocklist.length - 1,
        });
    });

    it("loads extension health from runtime rulesets and persisted state", async () => {
        getSync.mockResolvedValueOnce({
            settingsInitialized: true,
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: true,
            defaultBlocklist: [{ value: "||doubleclick.net^", enabled: false }],
            disabledSites: ["example.com"],
        });
        getLocal.mockResolvedValueOnce({ protectionPausedUntil: 0 });
        getSession.mockResolvedValueOnce({ sessionAllowlist: ["news.example"] });

        const snapshot = await loadExtensionHealthSnapshot();

        expect(snapshot).toMatchObject({
            status: "ready",
            statusLabel: "Ready",
            extensionId: "extension-id",
            manifestVersion: "3.2.2",
            enabledRulesets: ["core_protection", "youtube_core"],
            dynamicRuleCount: 2,
            staticCoreEnabled: true,
            youtubeRulesEnabled: true,
            settingsInitialized: true,
            protectionEnabled: true,
            defaultOverrideCount: 1,
            pausedUntil: 0,
            sessionAllowlistCount: 1,
            disabledSiteCount: 1,
        });
        expect(snapshot.issues).toEqual([]);
    });

    it("reports attention when required runtime state is missing", async () => {
        (chrome.declarativeNetRequest.getEnabledRulesets as jest.Mock<any>).mockResolvedValueOnce([]);
        (chrome.declarativeNetRequest.getDynamicRules as jest.Mock<any>).mockResolvedValueOnce([]);
        getSync.mockResolvedValueOnce({
            settingsInitialized: false,
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: true,
            defaultBlocklist: [],
            disabledSites: [],
        });
        getLocal.mockResolvedValueOnce({ protectionPausedUntil: Date.now() + 60_000 });
        getSession.mockResolvedValueOnce({});

        const snapshot = await loadExtensionHealthSnapshot();

        expect(snapshot.status).toBe("attention");
        expect(snapshot.issues).toEqual(expect.arrayContaining([
            "Settings have not finished first-run initialization.",
            "Protection is temporarily paused.",
            "The core static ruleset is not enabled.",
            "The YouTube static ruleset is not enabled.",
        ]));
    });

    it("normalizes network blocklist metadata across www/apex variants", async () => {
        getSync.mockResolvedValueOnce({
            defaultBlocklist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            forgetfulSites: [],
            focusBlocklist: [],
            heuristicKeywords: [],
            customHidingRules: {},
            persistentWallFixes: {},
            disabledSites: [],
        });
        getLocal.mockResolvedValueOnce({
            networkBlocklistMeta: {
                "www.reuters.com": { source: "settings", addedAt: 10 },
                "reuters.com": { source: "logger", addedAt: 20 },
            },
        });

        const snapshot = await loadRulesSnapshot();

        expect(snapshot.networkBlocklistMeta).toEqual({
            "reuters.com": { source: "logger", addedAt: 20 },
        });
    });

    it("counts cached malware domains only when the cache payload has an array", async () => {
        getLocal.mockResolvedValueOnce({
            "malware-list-cache": {
                domains: ["malware.example", "phishing.example"],
                lastUpdated: 1234,
            },
        });

        await expect(loadMalwareFeedStatus()).resolves.toMatchObject({
            cachedDomains: 2,
            lastUpdated: 1234,
        });

        getLocal.mockResolvedValueOnce({
            "malware-list-cache": {
                domains: "malware.example",
                lastUpdated: "bad timestamp",
            },
        });

        await expect(loadMalwareFeedStatus()).resolves.toMatchObject({
            cachedDomains: 0,
            lastUpdated: null,
        });
    });

    it("normalizes custom hiding rules and wall fixes across www/apex variants", async () => {
        getSync.mockResolvedValueOnce({
            defaultBlocklist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            forgetfulSites: [],
            focusBlocklist: [],
            heuristicKeywords: [],
            customHidingRules: {
                "www.reuters.com": [
                    { value: ".paywall", enabled: true },
                ],
                "reuters.com": [
                    { value: ".signup", enabled: true },
                    { value: ".paywall", enabled: false, lastHealed: 5 },
                ],
            },
            persistentWallFixes: {
                "www.reuters.com": { overlaySelector: ".overlay", enabled: true },
                "reuters.com": { contentUnlockSelector: "#main-content" },
            },
            disabledSites: [],
        });
        getLocal.mockResolvedValueOnce({
            networkBlocklistMeta: {},
        });

        const snapshot = await loadRulesSnapshot();

        expect(snapshot.customHidingRules).toEqual({
            "reuters.com": [
                { value: ".paywall", enabled: true, lastHealed: 5 },
                { value: ".signup", enabled: true },
            ],
        });
        expect(snapshot.persistentWallFixes).toEqual({
            "reuters.com": {
                overlaySelector: ".overlay",
                contentUnlockSelector: "#main-content",
                enabled: true,
            },
        });
    });
});
