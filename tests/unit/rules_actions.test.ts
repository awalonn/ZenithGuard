import { jest } from "@jest/globals";
import type { ContentMessage } from "../../src/js/shared/content_messages";

const getLocal = jest.fn() as jest.Mock;
const getSession = jest.fn() as jest.Mock;
const getSync = jest.fn() as jest.Mock;
const removeLocal = jest.fn() as jest.Mock;
const removeSession = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;
const setSession = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;
const sendContentMessageSafely = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSession,
    getSync,
    removeLocal,
    removeSession,
    setLocal,
    setSession,
    setSync,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessageSafely,
}));

const { createRulesActionRegistry } = await import("../../src/js/background/modules/message_actions/rules_actions");

describe("rules action registry", () => {
    const applyRules = jest.fn(async () => {}) as jest.MockedFunction<() => Promise<void>>;
    const broadcastToAllTabs = jest.fn(async (_message: ContentMessage) => {}) as jest.MockedFunction<(message: ContentMessage) => Promise<void>>;
    const query = jest.fn() as jest.Mock;
    const reload = jest.fn() as jest.Mock;

    beforeEach(() => {
        applyRules.mockReset();
        broadcastToAllTabs.mockReset();
        getLocal.mockReset();
        getSession.mockReset();
        getSync.mockReset();
        removeLocal.mockReset();
        removeSession.mockReset();
        setLocal.mockReset();
        setSession.mockReset();
        setSync.mockReset();
        sendContentMessageSafely.mockReset();
        query.mockReset();
        reload.mockReset();

        const clearAlarm = jest.fn(async () => true);
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                query,
                reload,
            },
            alarms: {
                create: jest.fn(),
                clear: clearAlarm,
            },
        } as unknown as typeof chrome;
    });

    it("applies rules before reloading tabs when global protection is toggled", async () => {
        const callOrder: string[] = [];
        setSync.mockImplementation(async () => {
            callOrder.push("setSync");
        });
        applyRules.mockImplementation(async () => {
            callOrder.push("applyRules");
        });
        (query as any).mockResolvedValue([{ id: 7 }]);
        reload.mockImplementation(async () => {
            callOrder.push("reload");
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        await registry.actions.TOGGLE_GLOBAL_PROTECTION({ data: { isEnabled: false } });

        expect(setSync).toHaveBeenCalledWith({ isProtectionEnabled: false });
        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledWith(7);
        expect(callOrder).toEqual(["setSync", "applyRules", "reload"]);
    });

    it("applies rules immediately after adding a custom network block", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [],
        });
        (getLocal as any).mockResolvedValue({
            networkBlocklistMeta: {},
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.ADD_TO_NETWORK_BLOCKLIST({
            domain: "tracker.example",
            source: "settings",
        });

        expect(result).toEqual({ success: true });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [{ value: "tracker.example", enabled: true }],
        });
        expect(applyRules).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["https://*.html-load.cc/*"],
        ["*://*.html-load.cc/*"],
        ["%2a.html-load.cc"],
        ["||*.html-load.cc^"],
    ])("normalizes wildcard network block input %s to its registrable host", async (domain) => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [],
        });
        (getLocal as any).mockResolvedValue({
            networkBlocklistMeta: {},
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.ADD_TO_NETWORK_BLOCKLIST({
            domain,
            source: "analyzer",
        });

        expect(result).toEqual({ success: true });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [{ value: "html-load.cc", enabled: true }],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "html-load.cc": {
                    source: "analyzer",
                    addedAt: expect.any(Number),
                },
            },
        });
        expect(applyRules).toHaveBeenCalledTimes(1);
    });

    it("does not fork a network blocklist entry across www and non-www hostnames", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [{ value: "washingtonpost.com", enabled: true }],
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.ADD_TO_NETWORK_BLOCKLIST({
            domain: "www.washingtonpost.com",
            source: "settings",
        });

        expect(result).toEqual({ success: false, message: "Rule already exists." });
        expect(setSync).not.toHaveBeenCalled();
        expect(applyRules).not.toHaveBeenCalled();
    });

    it("stores network-block metadata under the existing canonical hostname bucket", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [{ value: "washingtonpost.com", enabled: false }],
        });
        (getLocal as any).mockResolvedValue({
            networkBlocklistMeta: {},
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.ADD_TO_NETWORK_BLOCKLIST({
            domain: "www.washingtonpost.com",
            source: "settings",
        });

        expect(result).toEqual({ success: true });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [{ value: "washingtonpost.com", enabled: true }],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "washingtonpost.com": {
                    source: "settings",
                    addedAt: expect.any(Number),
                },
            },
        });
        expect(applyRules).toHaveBeenCalledTimes(1);
    });

    it("heals legacy www/apex metadata splits when storing a new custom network block", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [{ value: "washingtonpost.com", enabled: false }],
        });
        (getLocal as any).mockResolvedValue({
            networkBlocklistMeta: {
                "www.washingtonpost.com": { source: "logger", addedAt: 10 },
                "washingtonpost.com": { source: "settings", addedAt: 20 },
            },
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        await registry.actions.ADD_TO_NETWORK_BLOCKLIST({
            domain: "www.washingtonpost.com",
            source: "analyzer",
        });

        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "washingtonpost.com": {
                    source: "analyzer",
                    addedAt: expect.any(Number),
                },
            },
        });
    });

    it("reapplies rules and hiding after bulk adding network and hiding rules", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [],
            customHidingRules: {},
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.BULK_ADD_RULES({
            data: {
                networkBlocklist: ["ads.example"],
                customHidingRules: {
                    domain: "news.example",
                    selectors: [".paywall"],
                },
            },
        });

        expect(result).toEqual({ success: true });
        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(broadcastToAllTabs).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
    });

    it("merges bulk-added hiding rules into an existing matching hostname bucket", async () => {
        (getSync as any).mockResolvedValue({
            networkBlocklist: [],
            customHidingRules: {
                "washingtonpost.com": [
                    { value: ".existing-paywall", enabled: true },
                ],
            },
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        await registry.actions.BULK_ADD_RULES({
            data: {
                networkBlocklist: [],
                customHidingRules: {
                    domain: "www.washingtonpost.com",
                    selectors: [".new-paywall"],
                },
            },
        });

        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [],
            customHidingRules: {
                "washingtonpost.com": [
                    { value: ".existing-paywall", enabled: true },
                    { value: ".new-paywall", enabled: true },
                ],
            },
        });
    });

    it("reapplies rules and hiding after resetting settings to defaults", async () => {
        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.RESET_SETTINGS_TO_DEFAULTS();

        expect(result).toEqual({ success: true });
        expect(setSync).toHaveBeenCalledWith(expect.objectContaining({
            isCookieBannerHidingEnabled: false,
            isSelfHealingEnabled: false,
            disabledSites: [],
            focusBlocklist: [],
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        }));
        expect(removeLocal).toHaveBeenCalledWith(["networkBlocklistMeta", "temporaryWallFixes", "protectionPausedUntil"]);
        expect(removeSession).toHaveBeenCalledWith("sessionAllowlist");
        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(broadcastToAllTabs).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
    });

    it("stores a temporary allowlist entry only once across www and non-www hostnames", async () => {
        (getSession as any).mockResolvedValue({
            sessionAllowlist: ["washingtonpost.com"],
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.TEMPORARILY_ALLOW_DOMAIN({
            domain: "www.washingtonpost.com",
        });

        expect(result).toEqual({ success: true });
        expect(setSession).not.toHaveBeenCalled();
        expect(applyRules).not.toHaveBeenCalled();
    });

    it("normalizes and stores a new temporary allowlist entry before applying rules", async () => {
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });
        const result = await registry.actions.TEMPORARILY_ALLOW_DOMAIN({
            domain: "https://www.washingtonpost.com/world/example",
        });

        expect(result).toEqual({ success: true });
        expect(setSession).toHaveBeenCalledWith({
            sessionAllowlist: ["www.washingtonpost.com"],
        });
        expect(applyRules).toHaveBeenCalledTimes(1);
    });

    it("creates and clears the focus-mode end alarm when starting and stopping focus mode", async () => {
        const registry = createRulesActionRegistry({ applyRules, broadcastToAllTabs });

        await registry.actions.START_FOCUS_MODE({ duration: 25 });
        expect(chrome.alarms.create).toHaveBeenCalledWith("focusModeEnd", expect.objectContaining({
            when: expect.any(Number),
        }));

        await registry.actions.STOP_FOCUS_MODE();
        expect(chrome.alarms.clear).toHaveBeenCalledWith("focusModeEnd");
    });
});
