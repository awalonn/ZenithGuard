import { jest } from "@jest/globals";

const getActiveTab = jest.fn() as jest.Mock;
const getNetworkLog = jest.fn() as jest.Mock;
const getPrivacyStats = jest.fn() as jest.Mock;
const getLocal = jest.fn() as jest.Mock;
const getSync = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;
const removeLocal = jest.fn() as jest.Mock;
const getWallAssistTraceMap = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    getActiveTab,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    getNetworkLog,
    getPrivacyStats,
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
    removeLocal,
}));

jest.unstable_mockModule("../../src/js/shared/wall_assist_trace", () => ({
    getWallAssistTraceMap,
}));

const {
    loadPopupSnapshot,
    getIsSiteProtectionEnabled,
    getIsIsolationModeEnabled,
    getIsForgetfulBrowsingEnabled,
    getToolActivityForHostname,
} = await import("../../src/ui/popup/loaders");

describe("popup loader helpers", () => {
    beforeEach(() => {
        getActiveTab.mockReset();
        getNetworkLog.mockReset();
        getPrivacyStats.mockReset();
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        removeLocal.mockReset();
        getWallAssistTraceMap.mockReset();
        delete (globalThis as { chrome?: typeof chrome }).chrome;
        (getNetworkLog as any).mockResolvedValue([]);
        (getPrivacyStats as any).mockResolvedValue({ trackersBlocked: 0 });
        (getWallAssistTraceMap as any).mockResolvedValue({});
    });

    it("matches tool activity across www and non-www hostnames", () => {
        const entries = [
            {
                tool: "Experimental Wall Assist",
                title: "No Useful Wall Fix Found",
                message: "Try Inspector instead.",
                tone: "info" as const,
                timestamp: Date.now(),
                domain: "washingtonpost.com",
            },
            {
                tool: "Fix Cookies",
                title: "Cookie Action Applied",
                message: "Applied.",
                tone: "success" as const,
                timestamp: Date.now(),
                domain: "example.com",
            },
        ];

        const result = getToolActivityForHostname(entries, "www.washingtonpost.com");

        expect(result).toHaveLength(1);
        expect(result[0]?.domain).toBe("washingtonpost.com");
    });

    it("does not show domainless tool activity as if it belonged to every site", () => {
        const entries = [
            {
                tool: "Inspector",
                title: "Inspector Hide Saved",
                message: "Saved.",
                tone: "success" as const,
                timestamp: Date.now(),
            },
            {
                tool: "Experimental Wall Assist",
                title: "Wall Fix Saved",
                message: "Saved.",
                tone: "success" as const,
                timestamp: Date.now(),
                domain: "washingtonpost.com",
            },
        ];

        const result = getToolActivityForHostname(entries, "www.washingtonpost.com");

        expect(result).toHaveLength(1);
        expect(result[0]?.tool).toBe("Experimental Wall Assist");
    });

    it("keeps cosmetic cleanup activity scoped to the current site", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 18,
            url: "https://www.zerogpt.com/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {},
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [
                    {
                        tool: "Cosmetic Cleanup",
                        title: "Ad Shells Cleaned",
                        message: "Collapsed 2 leftover ad shells after blocking.",
                        tone: "success",
                        timestamp: 1711111111111,
                        domain: "zerogpt.com",
                    },
                    {
                        tool: "Cosmetic Cleanup",
                        title: "Ad Shells Cleaned",
                        message: "Collapsed 1 leftover ad shell after blocking.",
                        tone: "success",
                        timestamp: 1711111111000,
                        domain: "example.com",
                    },
                ],
                temporaryWallFixes: {},
                cosmeticCleanupSummaryByHostname: {
                    "zerogpt.com": {
                        count: 2,
                        latestHint: "iframe googleads.g.doubleclick.net",
                        updatedAt: 1711111111111,
                        pageUrl: "https://www.zerogpt.com/",
                    },
                },
            })
            .mockResolvedValueOnce({});

        const snapshot = await loadPopupSnapshot();
        const activity = getToolActivityForHostname(snapshot.storage.toolActivityLog, snapshot.hostname);

        expect(activity).toHaveLength(1);
        expect(activity[0]).toMatchObject({
            tool: "Cosmetic Cleanup",
            title: "Ad Shells Cleaned",
            message: "Collapsed 2 leftover ad shells after blocking.",
            tone: "success",
            domain: "zerogpt.com",
        });
        expect(snapshot.storage.cosmeticCleanupSummaryByHostname["zerogpt.com"]).toMatchObject({
            count: 2,
            latestHint: "iframe googleads.g.doubleclick.net",
        });
    });

    it("uses the most recent web tab when the active tab is the extension popup page", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 40,
            active: true,
            lastAccessed: 300,
            url: "chrome-extension://extension-id/src/pages/popup.html",
        });
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                query: jest.fn(async () => [
                    {
                        id: 40,
                        active: true,
                        lastAccessed: 300,
                        url: "chrome-extension://extension-id/src/pages/popup.html",
                    },
                    {
                        id: 41,
                        active: false,
                        lastAccessed: 200,
                        url: "https://older.example/",
                    },
                    {
                        id: 42,
                        active: false,
                        lastAccessed: 250,
                        url: "https://www.latest.example/article",
                    },
                ]),
            },
        } as unknown as typeof chrome;
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {},
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [
                    {
                        tool: "Site Report",
                        title: "Site Report Copied",
                        message: "Copied.",
                        tone: "success",
                        timestamp: 1711111111111,
                        domain: "latest.example",
                    },
                ],
                temporaryWallFixes: {},
            })
            .mockResolvedValueOnce({});

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.tabId).toBe(42);
        expect(snapshot.hostname).toBe("www.latest.example");
        expect(snapshot.isExtensionPage).toBe(false);
        expect(getNetworkLog).toHaveBeenCalledWith(42);
    });

    it("finds temporary and saved wall fixes across www and non-www hostnames", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 15,
            url: "https://www.washingtonpost.com/world/2026/03/28/example/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {},
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".saved-paywall",
                    enabled: true,
                },
            },
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [],
                temporaryWallFixes: {
                    "washingtonpost.com": {
                        overlaySelector: ".temp-paywall",
                    },
                },
            })
            .mockResolvedValueOnce({});

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.temporaryWallFix).toEqual({
            overlaySelector: ".temp-paywall",
        });
        expect(snapshot.hasSavedWallFix).toBe(true);
    });

    it("finds saved hidden rules across www and non-www hostnames", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 22,
            url: "https://www.washingtonpost.com/world/2026/03/28/example/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {
                "washingtonpost.com": [
                    { value: ".paywall", enabled: true },
                ],
            },
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [],
                temporaryWallFixes: {},
            })
            .mockResolvedValueOnce({});

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.hiddenRules).toEqual([
            { value: ".paywall", enabled: true },
        ]);
    });

    it("normalizes hidden-rule and wall-fix buckets in the popup snapshot", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 23,
            url: "https://www.washingtonpost.com/world/2026/03/28/example/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {
                "www.washingtonpost.com": [
                    { value: ".paywall", enabled: true },
                ],
                "washingtonpost.com": [
                    { value: ".signup", enabled: true },
                ],
            },
            persistentWallFixes: {
                "www.washingtonpost.com": {
                    overlaySelector: ".saved-paywall",
                    enabled: true,
                },
                "washingtonpost.com": {
                    contentUnlockSelector: "#main-content",
                },
            },
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [],
                temporaryWallFixes: {
                    "www.washingtonpost.com": {
                        overlaySelector: ".temp-paywall",
                    },
                    "washingtonpost.com": {
                        contentUnlockSelector: "#main-content",
                    },
                },
            })
            .mockResolvedValueOnce({});

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.hiddenRules).toEqual([
            { value: ".paywall", enabled: true },
            { value: ".signup", enabled: true },
        ]);
        expect(snapshot.temporaryWallFix).toEqual({
            overlaySelector: ".temp-paywall",
            contentUnlockSelector: "#main-content",
        });
        expect(snapshot.hasSavedWallFix).toBe(true);
    });

    it("reads popup network log entries from the snapshot response shape", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 31,
            url: "https://www.washingtonpost.com/world/2026/03/28/example/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {},
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [],
                temporaryWallFixes: {},
            })
            .mockResolvedValueOnce({});
        (getNetworkLog as any).mockResolvedValue({
            entries: [
                {
                    id: 7,
                    url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
                    status: "blocked",
                    type: "script",
                    timestamp: 1234567890,
                    matchedRuleInfo: {
                        source: "core",
                        detail: "ads",
                        matchedValue: "doubleclick.net",
                        category: "ads",
                    },
                },
            ],
            sessionStartedAt: 1234567000,
            lastUpdatedAt: 1234567890,
        });

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.networkLog).toEqual([
            {
                id: 7,
                url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js",
                status: "blocked",
                type: "script",
                timestamp: 1234567890,
                matchedRuleInfo: {
                    source: "core",
                    detail: "ads",
                    matchedValue: "doubleclick.net",
                    category: "ads",
                },
            },
        ]);
    });

    it("derives trackers seen from trackersFound when the privacy payload is legacy-shaped", async () => {
        (getActiveTab as any).mockResolvedValue({
            id: 32,
            url: "https://www.washingtonpost.com/world/2026/03/28/example/",
        });
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [],
            forgetfulSites: [],
            customHidingRules: {},
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        });
        (getLocal as any)
            .mockResolvedValueOnce({
                toolActivityLog: [],
                temporaryWallFixes: {},
            })
            .mockResolvedValueOnce({});
        (getPrivacyStats as any).mockResolvedValue({
            grade: "B",
            score: 80,
            trackersFound: [
                { id: "criteo.com", name: "criteo.com", category: "Advertising" },
                { id: "doubleclick.net", name: "doubleclick.net", category: "Advertising" },
            ],
        });

        const snapshot = await loadPopupSnapshot();

        expect(snapshot.privacyStats.trackersDetected).toBe(2);
        expect(snapshot.privacyStats.trackersBlocked).toBe(0);
    });

    it("treats disabled sites as matching across www and non-www hostnames", () => {
        expect(getIsSiteProtectionEnabled({
            hostname: "www.washingtonpost.com",
            isExtensionPage: false,
            settings: {
                isProtectionEnabled: true,
                disabledSites: ["washingtonpost.com"],
                isolationModeSites: [],
                forgetfulSites: [],
                customHidingRules: {},
                persistentWallFixes: {},
                isFocusModeEnabled: false,
                focusModeUntil: 0,
            },
        } as any)).toBe(false);
    });

    it("treats isolation mode as matching across www and non-www hostnames", () => {
        expect(getIsIsolationModeEnabled({
            hostname: "www.washingtonpost.com",
            isExtensionPage: false,
            settings: {
                isProtectionEnabled: true,
                disabledSites: [],
                isolationModeSites: [{ value: "washingtonpost.com", enabled: true }],
                forgetfulSites: [],
                customHidingRules: {},
                persistentWallFixes: {},
                isFocusModeEnabled: false,
                focusModeUntil: 0,
            },
        } as any)).toBe(true);
    });

    it("treats forgetful browsing as matching across www and non-www hostnames", () => {
        expect(getIsForgetfulBrowsingEnabled({
            hostname: "www.washingtonpost.com",
            isExtensionPage: false,
            settings: {
                isProtectionEnabled: true,
                disabledSites: [],
                isolationModeSites: [],
                forgetfulSites: [{ value: "washingtonpost.com", enabled: true }],
                customHidingRules: {},
                persistentWallFixes: {},
                isFocusModeEnabled: false,
                focusModeUntil: 0,
            },
        } as any)).toBe(true);
    });
});
