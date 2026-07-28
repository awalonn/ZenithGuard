import { jest } from "@jest/globals";

type TabUpdateInfo = {
    status?: string;
};

const openAnalyzerPage = jest.fn() as jest.Mock;
const openLoggerPage = jest.fn() as jest.Mock;
const openOptionsPage = jest.fn() as jest.Mock;
const sendContentMessage = jest.fn() as jest.Mock;
const sendMessage = jest.fn() as jest.Mock;
const getLocal = jest.fn() as jest.Mock;
const getSync = jest.fn() as jest.Mock;
const removeLocal = jest.fn() as jest.Mock;
const removeSync = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openAnalyzerPage,
    openLoggerPage,
    openOptionsPage,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessage,
    sendMessage,
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    removeLocal,
    removeSync,
    setLocal,
    setSync,
}));

const popupActions = await import("../../src/ui/popup/actions");
const { buildSitePolicyState } = await import("../../src/ui/popup/state");

describe("popup action helpers", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        (globalThis as { chrome?: typeof chrome }).chrome = undefined;
        openAnalyzerPage.mockReset();
        openLoggerPage.mockReset();
        openOptionsPage.mockReset();
        sendContentMessage.mockReset();
        sendMessage.mockReset();
        getLocal.mockReset();
        getSync.mockReset();
        removeLocal.mockReset();
        removeSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("maps Fix Cookies success into a success status card", async () => {
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        (sendMessage as any).mockResolvedValue({
            result: { selector: "#accept-cookies" },
        });

        const result = await popupActions.runPageTool("FIX_COOKIES", 12, "theguardian.com");

        expect(sendMessage).toHaveBeenCalledWith({
            type: "HANDLE_COOKIE_CONSENT",
            data: { tabId: 12 },
        });
        expect(result).toEqual({
            title: "Cookie Action Applied",
            message: "ZenithGuard triggered a consent action on the page. Check the page state before closing the popup.",
            tone: "success",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Fix Cookies",
                    title: "Cookie Action Applied",
                    tone: "success",
                    domain: "theguardian.com",
                }),
            ],
        });
    });

    it("maps Fix Cookies Gemini-key failures into an actionable settings card", async () => {
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        (sendMessage as any).mockResolvedValue({
            error: "Gemini API key is not set",
        });

        const result = await popupActions.runPageTool("FIX_COOKIES", 12, "theguardian.com");

        expect(result).toMatchObject({
            title: "Gemini Key Required",
            tone: "error",
            actionLabel: "Open Settings",
            action: "open-settings",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Fix Cookies",
                    title: "Gemini Key Required",
                    tone: "error",
                    domain: "theguardian.com",
                }),
            ],
        });
    });

    it("normalizes tool activity domains to the apex hostname on popup writes", async () => {
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        (sendMessage as any).mockResolvedValue({
            result: { selector: "#accept-cookies" },
        });

        await popupActions.runPageTool("FIX_COOKIES", 12, "www.theguardian.com");

        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Fix Cookies",
                    domain: "theguardian.com",
                }),
            ],
        });
    });

    it("stores partial wall-fix selectors and returns the partial status card", async () => {
        (sendMessage as any).mockResolvedValue({
            selectors: {
                overlaySelector: ".paywall",
                scrollSelector: "body",
                contentUnlockSelector: "",
            },
        });
        (getLocal as any).mockResolvedValue({
            temporaryWallFixes: {
                "existing.com": {
                    overlaySelector: ".existing",
                },
            },
        });

        const result = await popupActions.runPageTool("DEFEAT_WALL", 44, "medium.com");

        expect(sendMessage).toHaveBeenCalledWith({
            type: "DEFEAT_ADBLOCK_WALL",
            data: { tabId: 44 },
        });
        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {
                "existing.com": {
                    overlaySelector: ".existing",
                },
                "medium.com": {
                    overlaySelector: ".paywall",
                    scrollSelector: "body",
                    contentUnlockSelector: "",
                },
            },
        });
        expect(result).toEqual({
            title: "Partial Wall Fix Applied",
            message: "Gemini found an overlay to hide, but no strong content unlock target. The wall may still remain. Check Wall Fix Details before saving.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Experimental Wall Assist",
                    title: "Partial Wall Fix Applied",
                    tone: "info",
                    domain: "medium.com",
                }),
            ],
        });
    });

    it("reuses the existing temporary wall-fix hostname bucket across www variants", async () => {
        (sendMessage as any).mockResolvedValue({
            selectors: {
                overlaySelector: ".paywall",
                scrollSelector: "body",
                contentUnlockSelector: "#main-content",
            },
        });
        (getLocal as any).mockResolvedValue({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".old-paywall",
                },
            },
        });

        await popupActions.runPageTool("DEFEAT_WALL", 44, "www.washingtonpost.com");

        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".paywall",
                    scrollSelector: "body",
                    contentUnlockSelector: "#main-content",
                },
            },
        });
    });

    it("records no-useful-wall-fix outcomes in recent tool activity", async () => {
        (sendMessage as any).mockResolvedValue({});
        (getLocal as any)
            .mockResolvedValueOnce({ toolActivityLog: [] });

        const result = await popupActions.runPageTool("DEFEAT_WALL", 77, "washingtonpost.com");

        expect(result).toEqual({
            title: "No Useful Wall Fix Found",
            message: "Gemini did not return a selector set worth applying on this page. Use Inspector for a real manual cleanup instead of retrying blindly.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Experimental Wall Assist",
                    title: "No Useful Wall Fix Found",
                    tone: "info",
                    domain: "washingtonpost.com",
                }),
            ],
        });
    });

    it("still returns a wall-fix result card when tool activity persistence fails", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        (sendMessage as any).mockResolvedValue({});
        (getLocal as any).mockResolvedValueOnce({ toolActivityLog: [] });
        (setLocal as any).mockRejectedValueOnce(new Error("storage write failed"));

        const result = await popupActions.runPageTool("DEFEAT_WALL", 77, "washingtonpost.com");

        expect(result).toEqual({
            title: "No Useful Wall Fix Found",
            message: "Gemini did not return a selector set worth applying on this page. Use Inspector for a real manual cleanup instead of retrying blindly.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        });
        expect(warnSpy).toHaveBeenCalledWith(
            "ZenithGuard: Failed to persist popup tool activity.",
            expect.any(Error),
        );
    });

    it("closes the popup after starting Inspector", async () => {
        const closeSpy = jest.spyOn(window, "close").mockImplementation(() => {});

        await popupActions.startInspector(18, "wall-recovery");
        jest.advanceTimersByTime(50);

        expect(sendContentMessage).toHaveBeenCalledWith(18, {
            type: "START_INSPECTOR_MODE",
            mode: "wall-recovery",
        }, { frameId: 0 });
        expect(closeSpy).toHaveBeenCalled();
    });

    it("closes the popup after starting Zapper", async () => {
        const closeSpy = jest.spyOn(window, "close").mockImplementation(() => {});

        await popupActions.startZapper(9);
        jest.advanceTimersByTime(50);

        expect(sendContentMessage).toHaveBeenCalledWith(9, {
            type: "START_ZAPPER_MODE",
        }, { frameId: 0 });
        expect(closeSpy).toHaveBeenCalled();
    });

    it("returns an actionable error card when Inspector cannot reach the content script", async () => {
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        (sendContentMessage as any).mockRejectedValue(new Error("Could not establish connection. Receiving end does not exist."));

        const result = await popupActions.runPageTool("START_INSPECTOR_MODE", 18, "chrome.google.com");

        expect(result).toEqual({
            title: "Inspector Not Available",
            message: "ZenithGuard could not reach its page tools on this tab. Reload the page and try again, or use a normal website tab instead of a protected browser page.",
            tone: "error",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Inspector",
                    title: "Inspector Not Available",
                    tone: "error",
                    domain: "chrome.google.com",
                }),
            ],
        });
    });

    it("returns an actionable error card when Zapper cannot reach the content script", async () => {
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        (sendContentMessage as any).mockRejectedValue(new Error("Could not establish connection. Receiving end does not exist."));

        const result = await popupActions.runPageTool("START_ZAPPER_MODE", 9, "chrome.google.com");

        expect(result).toEqual({
            title: "Zapper Not Available",
            message: "ZenithGuard could not reach its page tools on this tab. Reload the page and try again, or use a normal website tab instead of a protected browser page.",
            tone: "error",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Zapper",
                    title: "Zapper Not Available",
                    tone: "error",
                    domain: "chrome.google.com",
                }),
            ],
        });
    });

    it("removes a saved hidden rule and reapplies hiding rules", async () => {
        (getSync as any).mockResolvedValue({
            customHidingRules: {
                "example.com": [
                    { value: ".banner", enabled: true },
                    { value: ".overlay", enabled: true },
                ],
                "other.com": [
                    { value: ".other", enabled: true },
                ],
            },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        await popupActions.removeHiddenRule("example.com", 0);

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {
                "example.com": [
                    { value: ".overlay", enabled: true },
                ],
                "other.com": [
                    { value: ".other", enabled: true },
                ],
            },
        });
        expect(sendMessage).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Saved Cleanup",
                    title: "Hidden Rule Removed",
                    tone: "info",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("removes the domain bucket when the last hidden rule is deleted", async () => {
        (getSync as any).mockResolvedValue({
            customHidingRules: {
                "example.com": [
                    { value: ".banner", enabled: true },
                ],
            },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        await popupActions.removeHiddenRule("example.com", 0);

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {},
        });
        expect(sendMessage).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Saved Cleanup",
                    title: "Hidden Rule Removed",
                    tone: "info",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("reloads the current tab when site pause is toggled from the popup", async () => {
        (getSync as any).mockResolvedValue({
            disabledSites: [],
        });

        await popupActions.toggleSitePause("example.com", 33);

        expect(setSync).toHaveBeenCalledWith({
            disabledSites: ["example.com"],
        });
        expect(sendMessage).toHaveBeenCalledWith({
            type: "APPLY_RULES_AND_RELOAD_TAB",
            data: { tabId: 33 },
        });
    });

    it("waits for the site toggle reload to finish before resolving when tab events are available", async () => {
        const updatedListeners: Array<(tabId: number, changeInfo: TabUpdateInfo) => void> = [];
        const removedListeners: Array<(tabId: number) => void> = [];

        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                onUpdated: {
                    addListener: jest.fn((listener: (tabId: number, changeInfo: TabUpdateInfo) => void) => {
                        updatedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
                onRemoved: {
                    addListener: jest.fn((listener: (tabId: number) => void) => {
                        removedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;

        (getSync as any).mockResolvedValue({
            disabledSites: [],
        });
        (sendMessage as any).mockImplementation(async () => {
            updatedListeners.forEach((listener) => listener(33, { status: "complete" }));
            return { success: true };
        });

        await popupActions.toggleSitePause("example.com", 33);

        expect(sendMessage).toHaveBeenCalledWith({
            type: "APPLY_RULES_AND_RELOAD_TAB",
            data: { tabId: 33 },
        });
        expect(updatedListeners).toHaveLength(1);
        expect(removedListeners).toHaveLength(1);
    });

    it("removes an existing paused-site entry even when the current hostname only differs by www", async () => {
        (getSync as any).mockResolvedValue({
            disabledSites: ["washingtonpost.com"],
        });

        await popupActions.toggleSitePause("www.washingtonpost.com", 33);

        expect(setSync).toHaveBeenCalledWith({
            disabledSites: [],
        });
        expect(sendMessage).toHaveBeenCalledWith({
            type: "APPLY_RULES_AND_RELOAD_TAB",
            data: { tabId: 33 },
        });
    });

    it("reloads the current tab when a site mode rule is toggled from the popup", async () => {
        (getSync as any).mockResolvedValue({
            isolationModeSites: [],
        });

        await popupActions.toggleSiteRule("isolationModeSites", "example.com", 44);

        expect(setSync).toHaveBeenCalledWith({
            isolationModeSites: [{ value: "example.com", enabled: true }],
        });
        expect(sendMessage).toHaveBeenCalledWith({
            type: "APPLY_RULES_AND_RELOAD_TAB",
            data: { tabId: 44 },
        });
    });

    it("toggles an existing site mode rule even when the current hostname only differs by www", async () => {
        (getSync as any).mockResolvedValue({
            isolationModeSites: [{ value: "washingtonpost.com", enabled: true }],
        });

        await popupActions.toggleSiteRule("isolationModeSites", "www.washingtonpost.com", 44);

        expect(setSync).toHaveBeenCalledWith({
            isolationModeSites: [{ value: "washingtonpost.com", enabled: false }],
        });
        expect(sendMessage).toHaveBeenCalledWith({
            type: "APPLY_RULES_AND_RELOAD_TAB",
            data: { tabId: 44 },
        });
    });

    it("moves a saved temporary wall fix into persistent state and clears the temporary copy", async () => {
        (getLocal as any)
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "example.com": {
                        overlaySelector: ".paywall",
                        scrollSelector: "body",
                    },
                },
            })
            .mockResolvedValueOnce({ toolActivityLog: [] });
        (getSync as any).mockResolvedValue({
            persistentWallFixes: {
                "other.com": {
                    overlaySelector: ".existing",
                    enabled: true,
                },
            },
        });

        await popupActions.saveTemporaryWallFix("example.com");

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {
                "other.com": {
                    overlaySelector: ".existing",
                    enabled: true,
                },
                "example.com": {
                    overlaySelector: ".paywall",
                    scrollSelector: "body",
                    enabled: true,
                },
            },
        });
        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {},
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Experimental Wall Assist",
                    title: "Wall Fix Saved",
                    tone: "success",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("saves a temporary wall fix even when the stored hostname only differs by www", async () => {
        (getLocal as any)
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "washingtonpost.com": {
                        overlaySelector: ".paywall",
                        scrollSelector: "body",
                    },
                },
            })
            .mockResolvedValueOnce({ toolActivityLog: [] });
        (getSync as any).mockResolvedValue({
            persistentWallFixes: {},
        });

        await popupActions.saveTemporaryWallFix("www.washingtonpost.com");

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".paywall",
                    scrollSelector: "body",
                    enabled: true,
                },
            },
        });
        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {},
        });
    });

    it("updates an existing saved wall-fix bucket instead of forking a www variant", async () => {
        (getLocal as any)
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "washingtonpost.com": {
                        overlaySelector: ".new-paywall",
                        scrollSelector: "body",
                    },
                },
            })
            .mockResolvedValueOnce({ toolActivityLog: [] });
        (getSync as any).mockResolvedValue({
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".old-paywall",
                    enabled: true,
                },
            },
        });

        await popupActions.saveTemporaryWallFix("www.washingtonpost.com");

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".new-paywall",
                    scrollSelector: "body",
                    enabled: true,
                },
            },
        });
        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {},
        });
    });

    it("reloads the tab after discarding a temporary wall fix", async () => {
        const reloadSpy = jest.fn(async () => {});
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                reload: reloadSpy,
            },
        } as unknown as typeof chrome;
        (getLocal as any)
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "example.com": {
                        overlaySelector: ".paywall",
                    },
                },
            })
            .mockResolvedValueOnce({ toolActivityLog: [] });

        await popupActions.discardTemporaryWallFix("example.com", 15);

        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {},
        });
        expect(reloadSpy).toHaveBeenCalledWith(15);
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Experimental Wall Assist",
                    title: "Temporary Wall Fix Discarded",
                    tone: "info",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("discards a temporary wall fix even when the stored hostname only differs by www", async () => {
        const reloadSpy = jest.fn(async () => {});
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                reload: reloadSpy,
            },
        } as unknown as typeof chrome;
        (getLocal as any)
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "washingtonpost.com": {
                        overlaySelector: ".paywall",
                    },
                },
            })
            .mockResolvedValueOnce({ toolActivityLog: [] });

        await popupActions.discardTemporaryWallFix("www.washingtonpost.com", 15);

        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {},
        });
        expect(reloadSpy).toHaveBeenCalledWith(15);
    });

    it("reloads the tab after removing a saved wall fix", async () => {
        const reloadSpy = jest.fn(async () => {});
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                reload: reloadSpy,
            },
        } as unknown as typeof chrome;
        (getSync as any).mockResolvedValue({
            persistentWallFixes: {
                "example.com": {
                    overlaySelector: ".paywall",
                    enabled: true,
                },
            },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        await popupActions.removeSavedWallFix("example.com", 21);

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {},
        });
        expect(reloadSpy).toHaveBeenCalledWith(21);
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Experimental Wall Assist",
                    title: "Saved Wall Fix Removed",
                    tone: "info",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("removes a saved wall fix even when the stored hostname only differs by www", async () => {
        const reloadSpy = jest.fn(async () => {});
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                reload: reloadSpy,
            },
        } as unknown as typeof chrome;
        (getSync as any).mockResolvedValue({
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".paywall",
                    enabled: true,
                },
            },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });

        await popupActions.removeSavedWallFix("www.washingtonpost.com", 21);

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {},
        });
        expect(reloadSpy).toHaveBeenCalledWith(21);
    });

    it("clears tool activity only for the current site", async () => {
        (getLocal as any).mockResolvedValue({
            toolActivityLog: [
                {
                    tool: "Experimental Wall Assist",
                    title: "Wall Fix Saved",
                    message: "Saved.",
                    tone: "success",
                    timestamp: 1,
                    domain: "washingtonpost.com",
                },
                {
                    tool: "Fix Cookies",
                    title: "Cookie Action Applied",
                    message: "Applied.",
                    tone: "success",
                    timestamp: 2,
                    domain: "example.com",
                },
                {
                    tool: "Inspector",
                    title: "Inspector Hide Saved",
                    message: "Saved.",
                    tone: "success",
                    timestamp: 3,
                },
            ],
        });

        await popupActions.clearToolActivity("www.washingtonpost.com");

        expect(setLocal).toHaveBeenCalledTimes(1);
        expect(setLocal.mock.calls[0][0]).toEqual({
            toolActivityLog: [
                {
                    tool: "Fix Cookies",
                    title: "Cookie Action Applied",
                    message: "Applied.",
                    tone: "success",
                    timestamp: 2,
                    domain: "example.com",
                },
                {
                    tool: "Inspector",
                    title: "Inspector Hide Saved",
                    message: "Saved.",
                    tone: "success",
                    timestamp: 3,
                },
            ],
        });
    });

    it("copies a site report package and records the copy in tool activity", async () => {
        const writeText = jest.fn(async (_text: string) => {});
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        const snapshot = {
            tabId: 7,
            hostname: "example.com",
            pageUrl: "https://example.com/article",
            isExtensionPage: false,
            settings: {
                isProtectionEnabled: true,
                disabledSites: [],
                isolationModeSites: [],
                forgetfulSites: [],
                customHidingRules: {},
                persistentWallFixes: {},
                isFocusModeEnabled: false,
                focusModeUntil: 0,
                isBreachWarningEnabled: true,
            },
            storage: {
                toolActivityLog: [],
                temporaryWallFixes: {},
                cosmeticCleanupSummaryByHostname: {},
            },
            privacyStats: {},
            networkLog: [],
            hiddenRules: [],
            temporaryWallFix: null,
            wallAssistTrace: null,
            hasSavedWallFix: false,
            hasRecentAiScan: false,
        };

        const result = await popupActions.copySiteReportPackage(
            snapshot,
            buildSitePolicyState(snapshot),
            [],
        );

        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ZenithGuard Site Report"));
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("https://example.com/article"));
        expect(result).toEqual({
            title: "Site Report Copied",
            message: "Copied the current site report. Paste it with a short note about the visible issue.",
            tone: "success",
            actionLabel: "Open Logger Review",
            action: "open-logger-review",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Site Report",
                    title: "Site Report Copied",
                    domain: "example.com",
                }),
            ],
        });
    });

    it("copies a redacted review candidate list and records the copy in tool activity", async () => {
        const writeText = jest.fn(async (_text: string) => {});
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        const snapshot = {
            tabId: 7,
            hostname: "example.com",
            pageUrl: "https://example.com/article?private=true",
            isExtensionPage: false,
            settings: {
                isProtectionEnabled: true,
                disabledSites: [],
                isolationModeSites: [],
                forgetfulSites: [],
                customHidingRules: {},
                persistentWallFixes: {},
                isFocusModeEnabled: false,
                focusModeUntil: 0,
                isBreachWarningEnabled: true,
            },
            storage: {
                toolActivityLog: [],
                temporaryWallFixes: {},
                cosmeticCleanupSummaryByHostname: {},
            },
            privacyStats: {},
            networkLog: [
                {
                    id: 1,
                    url: "https://prebid.example/private/bidder.js?auction=secret",
                    status: "allowed",
                    type: "script",
                    timestamp: 1_000,
                },
            ],
            hiddenRules: [],
            temporaryWallFix: null,
            wallAssistTrace: null,
            hasSavedWallFix: false,
            hasRecentAiScan: false,
        };

        const result = await popupActions.copyReviewCandidateList(snapshot);
        const copiedReviewList = String(writeText.mock.calls[0]?.[0] || "");

        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ZenithGuard Review Candidates"));
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("prebid.example | candidate: ||prebid.example^"));
        expect(copiedReviewList).not.toContain("private/bidder.js");
        expect(copiedReviewList).not.toContain("auction=secret");
        expect(result).toEqual({
            title: "Review List Copied",
            message: "Copied a redacted review-candidate list. Open Logger Review for full request details.",
            tone: "success",
            actionLabel: "Open Logger Review",
            action: "open-logger-review",
        });
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Review List",
                    title: "Review List Copied",
                    domain: "example.com",
                }),
            ],
        });
    });
});
