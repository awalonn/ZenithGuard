import { jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const addToNetworkBlocklist = jest.fn<AsyncMock>();
const classifyTextLocally = jest.fn<AsyncMock>();
const getNetworkLog = jest.fn<AsyncMock>();
const notifyApiKeyUpdated = jest.fn<AsyncMock>();
const sendMessage = jest.fn<AsyncMock>();
const sendMessageSafely = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const getLocal = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();
const openAnalyzerPage = jest.fn<AsyncMock>();
const openLoggerPage = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    addToNetworkBlocklist,
    classifyTextLocally,
    getNetworkLog,
    notifyApiKeyUpdated,
    sendMessage,
    sendMessageSafely,
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getSync,
    getLocal,
    setSync,
    setLocal,
}));

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openAnalyzerPage,
    openLoggerPage,
}));

const {
    buildActiveTabDiagnosticsContext,
    buildDiagnosticsNetworkSummary,
    buildExtensionDiagnosticsReport,
    buildExtensionDiagnosticsPreview,
    downloadExtensionDiagnosticsReport,
    exportSettingsSnapshot,
    importSettingsSnapshot,
    loadActiveTabDiagnosticsContext,
    openDiagnosticsSiteAnalyzer,
    openDiagnosticsSiteLogger,
    previewSettingsImport,
    reEnableGlobalProtection,
    resumeProtection,
} = await import("../../src/ui/settings/settings_controller");

async function readBlobText(blob: Blob): Promise<string> {
    if (typeof (blob as Blob & { text?: unknown }).text === "function") {
        return await (blob as Blob & { text: () => Promise<string> }).text();
    }

    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Could not read exported backup blob."));
        reader.readAsText(blob);
    });
}

describe("settings import/export", () => {
    beforeEach(() => {
        addToNetworkBlocklist.mockReset();
        classifyTextLocally.mockReset();
        notifyApiKeyUpdated.mockReset();
        sendMessageSafely.mockReset();
        getSync.mockReset();
        getLocal.mockReset();
        setSync.mockReset();
        setLocal.mockReset();

        (globalThis as { chrome?: typeof chrome }).chrome = {
            downloads: {
                download: jest.fn(),
            },
        } as unknown as typeof chrome;

        globalThis.URL.createObjectURL = jest.fn(() => "blob:zenithguard-backup");
        globalThis.URL.revokeObjectURL = jest.fn();
    });

    it("exports a versioned backup with sync settings and local rule metadata", async () => {
        getSync.mockResolvedValue({
            theme: "dark",
            geminiApiKey: "key",
            geminiModel: "gemini-3.7-flash",
            geminiModelOverride: "",
            isNextGenAIEradicatorEnabled: true,
            isYouTubeAdBlockingEnabled: true,
            isHeuristicEngineEnabled: true,
            isMalwareProtectionEnabled: true,
            isUrlCleanerEnabled: true,
            isCookieBannerHidingEnabled: false,
            isBreachWarningEnabled: true,
            isSandboxedIframeEnabled: true,
            isPerformanceModeEnabled: false,
            isSelfHealingEnabled: true,
            defaultBlocklist: [{ value: "||doubleclick.net^", enabled: true }],
            networkBlocklist: [{ value: "html-load.cc", enabled: true }],
            isolationModeSites: [{ value: "example.com", enabled: true }],
            forgetfulSites: [],
            focusBlocklist: ["www.example.com"],
            heuristicKeywords: [{ value: "third-party-ads", enabled: true }],
            customHidingRules: {
                "www.example.com": [{ value: ".paywall", enabled: true }],
            },
            persistentWallFixes: {
                "www.example.com": { overlaySelector: ".wall", enabled: true },
            },
            disabledSites: ["www.example.com"],
            isFocusModeEnabled: false,
            focusModeUntil: 0,
            settingsInitialized: true,
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "www.html-load.cc": { source: "analyzer", addedAt: 10 },
                "html-load.cc": { source: "settings", addedAt: 20 },
            },
        });

        const message = await exportSettingsSnapshot();

        expect(message).toContain("Exported");
        const downloadCall = (chrome.downloads.download as jest.Mock).mock.calls[0]?.[0];
        expect(downloadCall).toMatchObject({
            url: "blob:zenithguard-backup",
            filename: "zenithguard_backup.json",
            saveAs: true,
        });

        const blob = (URL.createObjectURL as jest.Mock).mock.calls[0]?.[0] as Blob;
        const exported = JSON.parse(await readBlobText(blob));
        expect(exported.sync).not.toHaveProperty("geminiApiKey");

        expect(exported).toMatchObject({
            format: "zenithguard-settings-backup",
            version: 1,
            sync: {
                networkBlocklist: [{ value: "html-load.cc", enabled: true }],
                focusBlocklist: ["example.com"],
                disabledSites: ["example.com"],
                customHidingRules: {
                    "example.com": [{ value: ".paywall", enabled: true }],
                },
                persistentWallFixes: {
                    "example.com": { overlaySelector: ".wall", enabled: true },
                },
            },
            local: {
                networkBlocklistMeta: {
                    "html-load.cc": { source: "settings", addedAt: 20 },
                },
            },
        });
    });

    it("imports a wrapped backup, restores sync and local state, and reapplies runtime rules", async () => {
        const file = new File([JSON.stringify({
            format: "zenithguard-settings-backup",
            version: 1,
            exportedAt: "2026-04-06T00:00:00.000Z",
            sync: {
                theme: "light",
                geminiApiKey: "key",
                geminiModel: "gemini-3.7-flash",
                geminiModelOverride: "",
                isNextGenAIEradicatorEnabled: true,
                isYouTubeAdBlockingEnabled: true,
                isHeuristicEngineEnabled: true,
                isMalwareProtectionEnabled: true,
                isUrlCleanerEnabled: true,
                isCookieBannerHidingEnabled: false,
                isBreachWarningEnabled: true,
                isSandboxedIframeEnabled: true,
                isPerformanceModeEnabled: false,
                isSelfHealingEnabled: true,
                defaultBlocklist: [{ value: "||doubleclick.net^", enabled: true }],
                networkBlocklist: [{ value: "https://html-load.cc/path", enabled: true }],
                isolationModeSites: [{ value: "www.example.com", enabled: true }],
                forgetfulSites: [{ value: "example.com", enabled: true }],
                focusBlocklist: ["www.example.com"],
                heuristicKeywords: [{ value: "third-party-ads", enabled: true }],
                customHidingRules: {
                    "www.example.com": [{ value: ".paywall", enabled: true }],
                },
                persistentWallFixes: {
                    "www.example.com": { overlaySelector: ".wall", enabled: true },
                },
                disabledSites: ["www.example.com"],
                isFocusModeEnabled: false,
                focusModeUntil: 0,
                settingsInitialized: true,
            },
            local: {
                networkBlocklistMeta: {
                    "www.html-load.cc": { source: "analyzer", addedAt: 10 },
                    "html-load.cc": { source: "settings", addedAt: 20 },
                },
            },
        })], "zenithguard_backup.json", { type: "application/json" });

        const message = await importSettingsSnapshot(file);

        expect(message).toBe("Imported ZenithGuard backup.");
        expect(setSync).toHaveBeenCalledWith(expect.objectContaining({
            theme: "light",
            networkBlocklist: [{ value: "html-load.cc", enabled: true }],
            isolationModeSites: [{ value: "example.com", enabled: true }],
            forgetfulSites: [{ value: "example.com", enabled: true }],
            focusBlocklist: ["example.com"],
            customHidingRules: {
                "example.com": [{ value: ".paywall", enabled: true }],
            },
            persistentWallFixes: {
                "example.com": { overlaySelector: ".wall", enabled: true },
            },
            disabledSites: ["example.com"],
        }));
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "html-load.cc": { source: "settings", addedAt: 20 },
            },
        });
        expect(setSync).not.toHaveBeenCalledWith(expect.objectContaining({ geminiApiKey: expect.anything() }));
        expect(notifyApiKeyUpdated).not.toHaveBeenCalled();
        expect(sendMessageSafely).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" });
        expect(sendMessageSafely).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
    });

    it("rejects wrapped backups from newer unsupported schema versions", async () => {
        const file = new File([JSON.stringify({
            format: "zenithguard-settings-backup",
            version: 2,
            exportedAt: "2026-04-06T00:00:00.000Z",
            sync: {
                theme: "light",
                networkBlocklist: [{ value: "html-load.cc", enabled: true }],
            },
        })], "future_backup.json", { type: "application/json" });

        await expect(importSettingsSnapshot(file)).rejects.toThrow("This backup was created by a newer ZenithGuard version.");
        expect(setSync).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
        expect(sendMessageSafely).not.toHaveBeenCalled();
    });

    it("rejects wrapped backups with missing schema versions", async () => {
        const file = new File([JSON.stringify({
            format: "zenithguard-settings-backup",
            sync: {
                theme: "light",
            },
        })], "missing_version_backup.json", { type: "application/json" });

        await expect(importSettingsSnapshot(file)).rejects.toThrow("This ZenithGuard backup is missing a supported schema version.");
        expect(setSync).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
        expect(sendMessageSafely).not.toHaveBeenCalled();
    });

    it("imports a legacy raw sync snapshot for backward compatibility", async () => {
        const file = new File([JSON.stringify({
            theme: "dark",
            networkBlocklist: [
                "https://html-load.cc/path",
                { value: "www.ads.example", enabled: false },
            ],
            heuristicKeywords: [
                "third-party-ads",
                { value: "/tracking.", enabled: false },
            ],
            customHidingRules: {
                "www.example.com": [{ value: ".paywall", enabled: true }],
            },
        })], "legacy.json", { type: "application/json" });

        const message = await importSettingsSnapshot(file);

        expect(message).toBe("Imported legacy ZenithGuard settings backup.");
        expect(setSync).toHaveBeenCalledWith(expect.objectContaining({
            networkBlocklist: [
                { value: "html-load.cc", enabled: true },
                { value: "www.ads.example", enabled: false },
            ],
            heuristicKeywords: [
                { value: "third-party-ads", enabled: true },
                { value: "/tracking.", enabled: false },
            ],
        }));
        expect(setLocal).not.toHaveBeenCalled();
    });

    it("previews backup imports without mutating storage", async () => {
        const file = new File([JSON.stringify({
            format: "zenithguard-settings-backup",
            version: 1,
            exportedAt: "2026-04-06T00:00:00.000Z",
            sync: {
                networkBlocklist: ["html-load.cc", { value: "ads.example", enabled: false }],
                heuristicKeywords: ["third-party-ads"],
                customHidingRules: {
                    "www.example.com": [
                        { value: ".paywall", enabled: true },
                        { value: ".ad-slot", enabled: true },
                    ],
                },
                persistentWallFixes: {
                    "example.com": { enabled: true },
                },
                disabledSites: ["www.paused.example"],
            },
            local: {
                networkBlocklistMeta: {
                    "html-load.cc": { source: "settings", addedAt: 20 },
                },
            },
        })], "zenithguard_backup.json", { type: "application/json" });

        const preview = await previewSettingsImport(file);

        expect(preview).toEqual({
            message: "Backup ready to import. Review the counts before replacing this browser profile's ZenithGuard settings.",
            isLegacy: false,
            items: [
                "2 custom network rules",
                "1 heuristic keyword",
                "2 custom hiding rules",
                "1 wall fix",
                "1 paused site",
                "1 rule metadata record",
            ],
        });
        expect(setSync).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
        expect(sendMessageSafely).not.toHaveBeenCalled();
    });
});

describe("settings diagnostics", () => {
    beforeEach(() => {
        (globalThis as { chrome?: typeof chrome }).chrome = {
            downloads: {
                download: jest.fn(),
            },
        } as unknown as typeof chrome;

        openAnalyzerPage.mockReset();
        openLoggerPage.mockReset();
        globalThis.URL.createObjectURL = jest.fn(() => "blob:zenithguard-diagnostics");
        globalThis.URL.revokeObjectURL = jest.fn();
    });

    it("builds a copyable extension diagnostics report", () => {
        const report = buildExtensionDiagnosticsReport({
            status: "ready",
            statusLabel: "Ready",
            issues: [],
            extensionId: "extension-id",
            manifestVersion: "3.2.2",
            enabledRulesets: ["core_protection", "youtube_core"],
            dynamicRuleCount: 26,
            staticCoreEnabled: true,
            youtubeRulesEnabled: true,
            youtubeRulesExpected: true,
            settingsInitialized: true,
            protectionEnabled: true,
            defaultOverrideCount: 0,
            pausedUntil: null,
            sessionAllowlistCount: 0,
            disabledSiteCount: 0,
        }, {
            dashboard: {
                toolActivityToday: 4,
                customNetworkRules: 7,
                enabledCoreRules: 128,
            },
            generatedAt: new Date("2026-04-19T10:15:30.000Z"),
            userAgent: "Chrome Test",
        });

        const parsed = JSON.parse(report);

        expect(parsed).toMatchObject({
            format: "zenithguard-extension-diagnostics",
            version: 2,
            generatedAt: "2026-04-19T10:15:30.000Z",
            browser: {
                userAgent: "Chrome Test",
            },
            pageContext: {
                source: "unavailable",
                unavailableReason: "no-web-tab",
            },
            runtime: {
                extensionId: "extension-id",
                manifestVersion: "3.2.2",
                healthStatus: "ready",
                enabledRulesets: ["core_protection", "youtube_core"],
                dynamicRuleCount: 26,
                staticCoreEnabled: true,
                youtubeRulesEnabled: true,
            },
            dashboard: {
                toolActivityToday: 4,
                customNetworkRules: 7,
                enabledCoreRules: 128,
            },
            protection: {
                settingsInitialized: true,
                protectionEnabled: true,
                pausedUntil: null,
                sessionAllowlistCount: 0,
                disabledSiteCount: 0,
                defaultOverrideCount: 0,
            },
            networkLog: {
                source: "unavailable",
                unavailableReason: "no-web-tab",
            },
            issues: [],
        });
    });

    it("summarizes diagnostics network log snapshots without including request URLs", () => {
        const summary = buildDiagnosticsNetworkSummary({
            entries: [
                { status: "blocked", timestamp: 100, url: "https://ads.example/private" },
                { status: "allowed", timestamp: 150, url: "https://cdn.example/script.js" },
                { status: "modified", timestamp: 125, url: "https://page.example/#fragment" },
            ],
            sessionStartedAt: 50,
            lastUpdatedAt: 200,
        });

        expect(summary).toEqual({
            source: "tab-log",
            totalEntries: 3,
            blockedEntries: 1,
            allowedEntries: 1,
            modifiedEntries: 1,
            sessionStartedAt: 50,
            lastUpdatedAt: 200,
        });
        expect(JSON.stringify(summary)).not.toContain("ads.example");
        expect(JSON.stringify(summary)).not.toContain("private");

        expect(buildDiagnosticsNetworkSummary([
            { status: "blocked", timestamp: 300 },
            "bad entry",
            null,
            { status: "modified", timestamp: "not a number" },
        ])).toEqual({
            source: "tab-log",
            totalEntries: 2,
            blockedEntries: 1,
            allowedEntries: 0,
            modifiedEntries: 1,
            sessionStartedAt: null,
            lastUpdatedAt: 300,
        });
    });

    it("adds redacted active-tab context to diagnostics reports", () => {
        const activeTabContext = buildActiveTabDiagnosticsContext({
            active: false,
            id: 42,
            lastAccessed: 100,
            url: "https://www.example.com/watch/video?id=secret#comments",
            windowId: 7,
        });

        const report = buildExtensionDiagnosticsReport({
            status: "ready",
            statusLabel: "Ready",
            issues: [],
            extensionId: "extension-id",
            manifestVersion: "3.2.2",
            enabledRulesets: ["core_protection", "youtube_core"],
            dynamicRuleCount: 26,
            staticCoreEnabled: true,
            youtubeRulesEnabled: true,
            youtubeRulesExpected: true,
            settingsInitialized: true,
            protectionEnabled: true,
            defaultOverrideCount: 0,
            pausedUntil: null,
            sessionAllowlistCount: 0,
            disabledSiteCount: 0,
        }, {
            activeTabContext: activeTabContext ?? undefined,
            generatedAt: new Date("2026-04-19T10:15:30.000Z"),
            networkSummary: {
                source: "tab-log",
                totalEntries: 3,
                blockedEntries: 2,
                allowedEntries: 1,
                modifiedEntries: 0,
                sessionStartedAt: 1_776_000_000_000,
                lastUpdatedAt: 1_776_000_001_000,
            },
            userAgent: "Chrome Test",
        });
        const parsed = JSON.parse(report);

        expect(parsed.pageContext).toMatchObject({
            source: "recent-web-tab",
            tabId: 42,
            windowId: 7,
            origin: "https://www.example.com",
            hostname: "www.example.com",
            domain: "example.com",
            protocol: "https:",
            redactedUrl: "https://www.example.com/[path]",
            hasPath: true,
            hasQuery: true,
            hasHash: true,
        });
        expect(report).not.toContain("id=secret");
        expect(report).not.toContain("comments");
        expect(report).not.toContain("/watch/video");
    });

    it("keeps the diagnostics report schema stable and redacted", () => {
        const activeTabContext = buildActiveTabDiagnosticsContext({
            active: true,
            id: 42,
            lastAccessed: 100,
            url: "https://www.example.com/account/private?token=secret#profile",
            windowId: 7,
        });

        const report = buildExtensionDiagnosticsReport({
            status: "attention",
            statusLabel: "Needs Attention",
            issues: ["Protection is temporarily paused."],
            extensionId: "extension-id",
            manifestVersion: "3.2.2",
            enabledRulesets: ["core_protection"],
            dynamicRuleCount: 12,
            staticCoreEnabled: true,
            youtubeRulesEnabled: false,
            youtubeRulesExpected: true,
            settingsInitialized: true,
            protectionEnabled: true,
            defaultOverrideCount: 2,
            pausedUntil: 1_775_000_000_000,
            sessionAllowlistCount: 1,
            disabledSiteCount: 3,
        }, {
            activeTabContext: activeTabContext ?? undefined,
            generatedAt: new Date("2026-04-19T10:15:30.000Z"),
            networkSummary: {
                source: "tab-log",
                totalEntries: 3,
                blockedEntries: 2,
                allowedEntries: 1,
                modifiedEntries: 0,
                sessionStartedAt: 1_776_000_000_000,
                lastUpdatedAt: 1_776_000_001_000,
            },
            userAgent: "Chrome Test",
        });
        const parsed = JSON.parse(report);

        expect(Object.keys(parsed).sort()).toEqual([
            "browser",
            "dashboard",
            "format",
            "generatedAt",
            "issues",
            "networkLog",
            "pageContext",
            "protection",
            "runtime",
            "version",
        ]);
        expect(Object.keys(parsed.browser).sort()).toEqual(["userAgent"]);
        expect(Object.keys(parsed.dashboard).sort()).toEqual([
            "customNetworkRules",
            "enabledCoreRules",
            "toolActivityToday",
        ]);
        expect(Object.keys(parsed.pageContext).sort()).toEqual([
            "domain",
            "hasHash",
            "hasPath",
            "hasQuery",
            "hostname",
            "origin",
            "protocol",
            "redactedUrl",
            "source",
            "tabId",
            "windowId",
        ]);
        expect(Object.keys(parsed.runtime).sort()).toEqual([
            "dynamicRuleCount",
            "enabledRulesets",
            "extensionId",
            "healthStatus",
            "healthStatusLabel",
            "manifestVersion",
            "staticCoreEnabled",
            "youtubeRulesEnabled",
            "youtubeRulesExpected",
        ]);
        expect(Object.keys(parsed.protection).sort()).toEqual([
            "defaultOverrideCount",
            "disabledSiteCount",
            "pausedUntil",
            "protectionEnabled",
            "sessionAllowlistCount",
            "settingsInitialized",
        ]);
        expect(Object.keys(parsed.networkLog).sort()).toEqual([
            "allowedEntries",
            "blockedEntries",
            "lastUpdatedAt",
            "modifiedEntries",
            "sessionStartedAt",
            "source",
            "totalEntries",
        ]);
        expect(parsed.networkLog).toMatchObject({
            source: "tab-log",
            totalEntries: 3,
            blockedEntries: 2,
            allowedEntries: 1,
        });
        expect(parsed.pageContext).toMatchObject({
            source: "recent-web-tab",
            domain: "example.com",
            redactedUrl: "https://www.example.com/[path]",
            hasPath: true,
            hasQuery: true,
            hasHash: true,
        });
        expect(report).not.toContain("/account/private");
        expect(report).not.toContain("token=secret");
        expect(report).not.toContain("profile");
    });

    it("builds a compact diagnostics preview without private URL parts", () => {
        const activeTabContext = buildActiveTabDiagnosticsContext({
            active: true,
            id: 42,
            lastAccessed: 100,
            url: "https://www.example.com/account/private?token=secret#profile",
            windowId: 7,
        });

        const preview = buildExtensionDiagnosticsPreview({
            status: "attention",
            statusLabel: "Needs Attention",
            issues: ["Protection is temporarily paused."],
            extensionId: "extension-id",
            manifestVersion: "3.2.2",
            enabledRulesets: ["core_protection", "youtube_core"],
            dynamicRuleCount: 26,
            staticCoreEnabled: true,
            youtubeRulesEnabled: true,
            youtubeRulesExpected: true,
            settingsInitialized: true,
            protectionEnabled: true,
            defaultOverrideCount: 0,
            pausedUntil: null,
            sessionAllowlistCount: 0,
            disabledSiteCount: 0,
        }, activeTabContext, {
            source: "tab-log",
            totalEntries: 4,
            blockedEntries: 2,
            allowedEntries: 1,
            modifiedEntries: 1,
            sessionStartedAt: 1_776_000_000_000,
            lastUpdatedAt: 1_776_000_001_000,
        }, {
            toolActivityToday: 5,
            customNetworkRules: 9,
            enabledCoreRules: 144,
        });

        expect(preview).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: "Health", value: "Needs Attention" }),
            expect.objectContaining({ label: "Site", value: "example.com", detail: "https://www.example.com/[path]" }),
            expect.objectContaining({ label: "Dashboard", value: "5 activities today", detail: "9 custom network rules, 144 enabled core rules." }),
            expect.objectContaining({ label: "Network Log", value: "4 decisions", detail: "2 blocked, 1 allowed, 1 modified." }),
            expect.objectContaining({ label: "Redaction", value: "Private URL parts removed", detail: "Hidden: path, query, fragment." }),
        ]));
        expect(JSON.stringify(preview)).not.toContain("/account/private");
        expect(JSON.stringify(preview)).not.toContain("token=secret");
        expect(JSON.stringify(preview)).not.toContain("profile");
    });

    it("loads the most recent current-window web tab for diagnostics context", async () => {
        const query = jest.fn(async () => [
            {
                active: true,
                id: 1,
                lastAccessed: 300,
                url: "chrome-extension://extension-id/src/pages/settings.html",
                windowId: 5,
            },
            {
                active: false,
                id: 2,
                lastAccessed: 200,
                url: "https://older.example/article?utm_source=test",
                windowId: 5,
            },
            {
                active: false,
                id: 3,
                lastAccessed: 250,
                url: "https://www.latest.example/path/to/page?token=secret",
                windowId: 5,
            },
        ]);
        (globalThis as { chrome?: typeof chrome }).chrome = {
            downloads: {
                download: jest.fn(),
            },
            tabs: {
                query,
            },
        } as unknown as typeof chrome;

        const context = await loadActiveTabDiagnosticsContext();

        expect(query).toHaveBeenCalledWith({ currentWindow: true });
        expect(context).toMatchObject({
            source: "recent-web-tab",
            tabId: 3,
            windowId: 5,
            domain: "latest.example",
            redactedUrl: "https://www.latest.example/[path]",
            hasQuery: true,
        });
    });

    it("downloads the extension diagnostics report as JSON", async () => {
        jest.useFakeTimers();
        const report = "{\n  \"format\": \"zenithguard-extension-diagnostics\"\n}";
        const click = jest.fn();
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = jest.spyOn(document, "createElement").mockImplementation((tagName: string, options?: ElementCreationOptions) => {
            const element = originalCreateElement(tagName, options);
            if (tagName.toLowerCase() === "a") {
                Object.defineProperty(element, "click", {
                    configurable: true,
                    value: click,
                });
            }

            return element;
        });

        try {
            downloadExtensionDiagnosticsReport(report);

            const blob = (URL.createObjectURL as jest.Mock).mock.calls[0]?.[0] as Blob;
            expect(blob.type).toBe("application/json");
            expect(await readBlobText(blob)).toBe(report);
            expect(click).toHaveBeenCalled();

            jest.advanceTimersByTime(60_000);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:zenithguard-diagnostics");
        } finally {
            createElementSpy.mockRestore();
            jest.useRealTimers();
        }
    });

    it("opens Logger for the diagnostics site context", async () => {
        openLoggerPage.mockResolvedValue(undefined);

        const message = await openDiagnosticsSiteLogger({
            source: "recent-web-tab",
            tabId: 42,
            windowId: 7,
            origin: "https://www.example.com",
            hostname: "www.example.com",
            domain: "example.com",
            protocol: "https:",
            redactedUrl: "https://www.example.com/[path]",
            hasPath: true,
            hasQuery: true,
            hasHash: false,
        });

        expect(message).toBe("Opened Logger for example.com.");
        expect(openLoggerPage).toHaveBeenCalledWith({
            tabId: 42,
            search: "example.com",
            status: "all",
        });
    });

    it("opens Analyzer for the diagnostics site context", async () => {
        openAnalyzerPage.mockResolvedValue(undefined);

        const message = await openDiagnosticsSiteAnalyzer({
            source: "recent-web-tab",
            tabId: 42,
            windowId: 7,
            origin: "https://www.example.com",
            hostname: "www.example.com",
            domain: "example.com",
            protocol: "https:",
            redactedUrl: "https://www.example.com/[path]",
            hasPath: true,
            hasQuery: true,
            hasHash: false,
        });

        expect(message).toBe("Opened Analyzer for example.com.");
        expect(openAnalyzerPage).toHaveBeenCalledWith(42);
    });

    it("rejects Logger shortcut when no diagnostics web tab is available", async () => {
        await expect(openDiagnosticsSiteLogger({
            source: "unavailable",
            tabId: null,
            windowId: null,
            origin: "",
            hostname: "",
            domain: "",
            protocol: "",
            redactedUrl: "",
            hasPath: false,
            hasQuery: false,
            hasHash: false,
            unavailableReason: "no-web-tab",
        })).rejects.toThrow("No diagnostics web tab is available for Logger.");

        expect(openLoggerPage).not.toHaveBeenCalled();
    });

    it("rejects Analyzer shortcut when no diagnostics web tab is available", async () => {
        await expect(openDiagnosticsSiteAnalyzer({
            source: "unavailable",
            tabId: null,
            windowId: null,
            origin: "",
            hostname: "",
            domain: "",
            protocol: "",
            redactedUrl: "",
            hasPath: false,
            hasQuery: false,
            hasHash: false,
            unavailableReason: "no-web-tab",
        })).rejects.toThrow("No diagnostics web tab is available for Analyzer.");

        expect(openAnalyzerPage).not.toHaveBeenCalled();
    });
});

describe("settings health repairs", () => {
    beforeEach(() => {
        setSync.mockReset();
        sendMessage.mockReset();
        sendMessageSafely.mockReset();
    });

    it("re-enables global protection and reapplies rules", async () => {
        sendMessage.mockResolvedValue({ success: true });

        const message = await reEnableGlobalProtection();

        expect(message).toBe("Protection re-enabled.");
        expect(sendMessage).toHaveBeenCalledWith({
            type: "TOGGLE_GLOBAL_PROTECTION",
            data: { isEnabled: true },
        });
        expect(setSync).not.toHaveBeenCalled();
        expect(sendMessageSafely).not.toHaveBeenCalled();
    });

    it("resumes temporarily paused protection and reapplies rules", async () => {
        sendMessage.mockResolvedValue({ success: true });

        const message = await resumeProtection();

        expect(message).toBe("Protection resumed.");
        expect(sendMessage).toHaveBeenCalledWith({ type: "RESUME_PROTECTION" });
        expect(setSync).not.toHaveBeenCalled();
        expect(sendMessageSafely).not.toHaveBeenCalled();
    });
});
