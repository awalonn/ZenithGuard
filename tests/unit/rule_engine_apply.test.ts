import { jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type DynamicRulesUpdate = {
    removeRuleIds?: number[];
    addRules?: chrome.declarativeNetRequest.Rule[];
};

const getLocal = jest.fn<AsyncMock>();
const getSession = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const getDynamicYoutubeRuleOverrides = jest.fn<AsyncMock>();
const getMergedMalwareDomains = jest.fn<AsyncMock>();
const setDynamicRuleMetadata = jest.fn<(metadata: Map<number, unknown>) => void>();
const clearDynamicRuleMetadata = jest.fn<() => void>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSession,
    getSync,
    setSync,
}));

jest.unstable_mockModule("../../src/js/background/modules/youtube_rules_cache", () => ({
    getDynamicYoutubeRuleOverrides,
}));

jest.unstable_mockModule("../../src/js/background/modules/malware_feed", () => ({
    getMergedMalwareDomains,
}));

jest.unstable_mockModule("../../src/js/background/modules/network_logger/dnr_pipeline", () => ({
    BUILT_IN_RULE_START_ID: 1,
    CORE_RULESET_ID: "core_protection",
    HEURISTIC_RULE_START_ID: 10_000,
    ISOLATION_MODE_RULE_START_ID: 20_000,
    MALWARE_RULE_START_ID: 30_000,
    NETWORK_BLOCKLIST_RULE_START_ID: 40_000,
    USER_ALLOWLIST_RULE_START_ID: 50_000,
    YOUTUBE_DYNAMIC_RULE_START_ID: 60_000,
    YOUTUBE_RULESET_ID: "youtube_core",
    setDynamicRuleMetadata,
    clearDynamicRuleMetadata,
}));

const { applyRules } = await import("../../src/js/background/modules/rule_engine");

describe("applyRules", () => {
    const getDynamicRules = jest.fn<AsyncMock>();
    const updateDynamicRules = jest.fn<(options: DynamicRulesUpdate) => Promise<void>>();
    const getEnabledRulesets = jest.fn<AsyncMock>();
    const getDisabledRuleIds = jest.fn<AsyncMock>();
    const updateEnabledRulesets = jest.fn<AsyncMock>();
    const updateStaticRules = jest.fn<AsyncMock>();

    function getAppliedDynamicRules(): chrome.declarativeNetRequest.Rule[] {
        return updateDynamicRules.mock.calls[0]?.[0]?.addRules || [];
    }

    function setDynamicRuleBudget(budget: number): void {
        (globalThis.chrome as unknown as { declarativeNetRequest: { MAX_NUMBER_OF_DYNAMIC_RULES: number } })
            .declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES = budget;
    }

    beforeEach(() => {
        getLocal.mockReset();
        getSession.mockReset();
        getSync.mockReset();
        setSync.mockReset();
        getDynamicYoutubeRuleOverrides.mockReset();
        getMergedMalwareDomains.mockReset();
        setDynamicRuleMetadata.mockReset();
        clearDynamicRuleMetadata.mockReset();
        getDynamicRules.mockReset();
        updateDynamicRules.mockReset();
        getEnabledRulesets.mockReset();
        getDisabledRuleIds.mockReset();
        updateEnabledRulesets.mockReset();
        updateStaticRules.mockReset();

        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                getURL: (path: string) => `chrome-extension://zenithguard/${path}`,
            },
            declarativeNetRequest: {
                MAX_NUMBER_OF_DYNAMIC_RULES: 5000,
                RuleActionType: {
                    REDIRECT: "redirect",
                },
                ResourceType: {
                    MAIN_FRAME: "main_frame",
                },
                getDynamicRules,
                updateDynamicRules,
                getEnabledRulesets,
                getDisabledRuleIds,
                updateEnabledRulesets,
                updateStaticRules,
            },
        } as unknown as typeof chrome;

        (getDynamicRules as any).mockResolvedValue([]);
        (updateDynamicRules as any).mockResolvedValue(undefined);
        (getEnabledRulesets as any).mockResolvedValue(["core_protection", "youtube_core"]);
        (getDisabledRuleIds as any).mockResolvedValue([]);
        (updateEnabledRulesets as any).mockResolvedValue(undefined);
        (updateStaticRules as any).mockResolvedValue(undefined);
        (getDynamicYoutubeRuleOverrides as any).mockResolvedValue(null);
        (getMergedMalwareDomains as any).mockResolvedValue([]);
        (getLocal as any).mockResolvedValue({});
    });

    it("applies session allowlist entries as user allow rules", async () => {
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: ["washingtonpost.com"],
        });

        await applyRules();

        expect(updateDynamicRules).toHaveBeenCalledWith({
            removeRuleIds: [],
            addRules: expect.arrayContaining([
                expect.objectContaining({
                    action: { type: "allow" },
                    condition: expect.objectContaining({
                        requestDomains: ["washingtonpost.com", "www.washingtonpost.com"],
                    }),
                }),
                expect.objectContaining({
                    action: { type: "allow" },
                    condition: expect.objectContaining({
                        initiatorDomains: ["washingtonpost.com", "www.washingtonpost.com"],
                    }),
                }),
            ]),
        });
    });

    it("can disable newly added Google ad-manager core rules through the default blocklist toggle state", async () => {
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [
                { value: "||googletagservices.com^", enabled: false },
                { value: "||securepubads.g.doubleclick.net^", enabled: false },
                { value: "gampad/", enabled: false },
            ],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        await applyRules();

        expect(updateStaticRules).toHaveBeenCalledWith(expect.objectContaining({
            rulesetId: "core_protection",
            disableRuleIds: expect.arrayContaining([92, 93, 95]),
        }));
    });

    it("dedupes and normalizes disabled static core rule ids", async () => {
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [
                { value: "||doubleclick.net^", enabled: false },
                { value: "doubleclick.net", enabled: false },
                { value: "https://doubleclick.net/path", enabled: false },
                { value: "DOUBLECLICK.NET", enabled: false },
                "google-analytics.com",
            ],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        await applyRules();

        expect(updateStaticRules).toHaveBeenCalledWith(expect.objectContaining({
            rulesetId: "core_protection",
            disableRuleIds: [1],
            enableRuleIds: [],
        }));
    });

    it("normalizes legacy and wildcard network blocklist entries before building DNR rules", async () => {
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [
                "ads.example",
                { value: "https://*.html-load.cc/*", enabled: true },
                { value: "disabled.example", enabled: false },
                { value: "/regex-fragment/", enabled: true },
            ],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        await applyRules();

        expect(updateDynamicRules).toHaveBeenCalledWith({
            removeRuleIds: [],
            addRules: expect.arrayContaining([
                expect.objectContaining({
                    id: 40_000,
                    condition: expect.objectContaining({ urlFilter: "||ads.example^" }),
                }),
                expect.objectContaining({
                    id: 40_001,
                    condition: expect.objectContaining({ urlFilter: "||html-load.cc^" }),
                }),
            ]),
        });
        const addRules = getAppliedDynamicRules();
        expect(addRules.map((rule) => rule.condition.urlFilter)).not.toContain("||undefined^");
        expect(addRules.map((rule) => rule.condition.urlFilter)).not.toContain("||disabled.example^");
    });

    it("skips replacing dynamic rules when the generated rules are unchanged", async () => {
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: ["ads.example"],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({ sessionAllowlist: [] });

        await applyRules();
        const firstAppliedRules = updateDynamicRules.mock.calls[0][0].addRules || [];
        updateDynamicRules.mockClear();
        (getDynamicRules as any).mockResolvedValue([...firstAppliedRules].reverse().map((rule) => ({
            ...rule,
            condition: {
                ...rule.condition,
                resourceTypes: [...(rule.condition.resourceTypes || [])].reverse(),
            },
        })));

        await applyRules();

        expect(updateDynamicRules).not.toHaveBeenCalled();
        expect(setDynamicRuleMetadata).toHaveBeenCalledTimes(2);
    });

    it("does not partially apply user allowlist groups when the dynamic rule budget is too small", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        setDynamicRuleBudget(2);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: ["ads.example"],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: ["news.example"],
        });

        await applyRules();

        const addRules = getAppliedDynamicRules();
        expect(addRules).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("user allowlist rules"));
        warnSpy.mockRestore();
    });

    it("applies complete user allowlist groups only", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        setDynamicRuleBudget(5);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: ["news.example", "blog.example"],
        });

        await applyRules();

        const addRules = getAppliedDynamicRules();
        expect(addRules.map((rule) => rule.id)).toEqual([50_000, 50_001, 50_002]);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Applied 3 of 6"));
        warnSpy.mockRestore();
    });

    it("does not add lower-priority dynamic blocks after user allowlist truncation", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        setDynamicRuleBudget(5);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: ["ads.example"],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: ["news.example", "blog.example"],
        });

        await applyRules();

        const addRules = getAppliedDynamicRules();
        expect(addRules.map((rule) => rule.id)).toEqual([50_000, 50_001, 50_002]);
        expect(addRules.map((rule) => rule.condition.urlFilter)).not.toContain("||ads.example^");
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("user allowlist rules"));
        warnSpy.mockRestore();
    });

    it("prioritizes focus mode over isolation rules when the dynamic rule budget is tight", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        setDynamicRuleBudget(1);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [
                { value: "washingtonpost.com", enabled: true },
            ],
            isMalwareProtectionEnabled: false,
            isFocusModeEnabled: true,
            focusModeUntil: Date.now() + 60_000,
            focusBlocklist: ["reddit.com"],
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        await applyRules();

        const addRules = getAppliedDynamicRules();
        const metadata = setDynamicRuleMetadata.mock.calls[0][0];
        expect(addRules.map((rule) => rule.id)).toEqual([7_000]);
        expect(addRules[0].condition.requestDomains).toEqual(["reddit.com", "www.reddit.com"]);
        expect(Array.from(metadata.keys())).toEqual([7_000]);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Isolation Mode rules"));
        warnSpy.mockRestore();
    });

    it("stores metadata only for dynamic rules that fit within the budget", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        setDynamicRuleBudget(1);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: ["ads.example"],
            isolationModeSites: [
                { value: "washingtonpost.com", enabled: true },
                { value: "nytimes.com", enabled: true },
            ],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        await applyRules();

        const addRules = getAppliedDynamicRules();
        const metadata = setDynamicRuleMetadata.mock.calls[0][0];
        expect(addRules.map((rule) => rule.id)).toEqual([20_000]);
        expect(Array.from(metadata.keys())).toEqual([20_000]);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Isolation Mode rules"));
        warnSpy.mockRestore();
    });

    it("disables static rulesets and clears dynamic rules when global protection is off", async () => {
        (getDynamicRules as any).mockResolvedValue([
            { id: 10_000 },
            { id: 40_000 },
        ]);
        (getEnabledRulesets as any).mockResolvedValue(["core_protection", "youtube_core"]);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: false,
            isYouTubeAdBlockingEnabled: true,
            isHeuristicEngineEnabled: true,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: ["adserver"],
            heuristicAllowlist: [],
            networkBlocklist: ["||ads.example^"],
            isolationModeSites: [],
            isMalwareProtectionEnabled: true,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        const result = await applyRules();

        expect(updateEnabledRulesets).toHaveBeenCalledWith({
            enableRulesetIds: [],
            disableRulesetIds: ["core_protection"],
        });
        expect(updateEnabledRulesets).toHaveBeenCalledWith({
            enableRulesetIds: [],
            disableRulesetIds: ["youtube_core"],
        });
        expect(updateDynamicRules).toHaveBeenCalledWith({
            removeRuleIds: [10_000, 40_000],
            addRules: [],
        });
        expect(clearDynamicRuleMetadata).toHaveBeenCalled();
        expect(result).toEqual({
            dynamicRuleCount: 0,
            staticCoreEnabled: false,
            youtubeRulesEnabled: false,
        });
    });

    it("keeps the YouTube static ruleset disabled when the YouTube setting is off", async () => {
        (getEnabledRulesets as any).mockResolvedValue(["core_protection", "youtube_core"]);
        (getSync as any).mockResolvedValue({
            isProtectionEnabled: true,
            isYouTubeAdBlockingEnabled: false,
            isHeuristicEngineEnabled: false,
            disabledSites: [],
            defaultBlocklist: [],
            heuristicKeywords: [],
            heuristicAllowlist: [],
            networkBlocklist: [],
            isolationModeSites: [],
            isMalwareProtectionEnabled: false,
        });
        (getSession as any).mockResolvedValue({
            sessionAllowlist: [],
        });

        const result = await applyRules();

        expect(updateEnabledRulesets).toHaveBeenCalledWith({
            enableRulesetIds: [],
            disableRulesetIds: ["youtube_core"],
        });
        expect(result.youtubeRulesEnabled).toBe(false);
    });
});
