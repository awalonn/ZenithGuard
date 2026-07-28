import { jest } from "@jest/globals";
import { getInitialSettingsSnapshot, getDefaultBlocklistEntries, getDefaultHeuristicKeywordEntries } from "../../src/js/background/modules/storage/defaults";

const getLocal: any = jest.fn();
const getSync: any = jest.fn();
const removeLocal: any = jest.fn();
const removeSync: any = jest.fn();
const setLocal: any = jest.fn();
const setSync: any = jest.fn();
const updateSync: any = jest.fn();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    removeLocal,
    removeSync,
    setLocal,
    setSync,
    updateSync,
}));

const { initializeSettings, migrateStoredRules } = await import("../../src/js/background/modules/storage/migrations");

describe("storage migrations", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        removeLocal.mockReset();
        removeSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        updateSync.mockReset();
    });

    it("collapses legacy www buckets during settings initialization", async () => {
        const completeSettings = {
            ...getInitialSettingsSnapshot(),
            autoAiDisabledOnce: true,
            defaultBlocklist: [],
        };

        getLocal
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "www.washingtonpost.com": { overlaySelector: "#drawer" },
                    "washingtonpost.com": { contentUnlockSelector: "#main" },
                },
                networkBlocklistMeta: {
                    "washingtonpost.com": { source: "settings", addedAt: 10 },
                    "www.washingtonpost.com": { source: "inspector", addedAt: 20 },
                },
                wallAssistTraceByHostname: {
                    "washingtonpost.com": {
                        domain: "washingtonpost.com",
                        status: "partial",
                        summary: "Older trace",
                        updatedAt: 10,
                        stages: [],
                    },
                    "www.washingtonpost.com": {
                        domain: "www.washingtonpost.com",
                        status: "success",
                        summary: "Newer trace",
                        updatedAt: 20,
                        stages: [],
                    },
                },
                toolActivityLog: [
                    {
                        tool: "Inspector",
                        title: "Inspector Hide Saved",
                        domain: "www.washingtonpost.com",
                        timestamp: 10,
                    },
                ],
            });

        getSync
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({
                customHidingRules: {
                    "www.washingtonpost.com": [".paywall"],
                    "washingtonpost.com": [{ value: ".modal", enabled: false }],
                },
                persistentWallFixes: {
                    "www.washingtonpost.com": { overlaySelector: "#drawer" },
                    "washingtonpost.com": { contentUnlockSelector: "#main", enabled: true },
                },
                disabledSites: ["www.washingtonpost.com", "washingtonpost.com"],
                focusBlocklist: ["www.reddit.com", "reddit.com"],
            })
            .mockResolvedValueOnce({
                settingsInitialized: true,
                autoAiDisabledOnce: true,
                defaultBlocklist: [],
            })
            .mockResolvedValueOnce(completeSettings);

        await initializeSettings();

        expect(updateSync).toHaveBeenCalledWith({
            customHidingRules: {
                "washingtonpost.com": [
                    { value: ".paywall", enabled: true },
                    { value: ".modal", enabled: false },
                ],
            },
            persistentWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: "#drawer",
                    contentUnlockSelector: "#main",
                    enabled: true,
                },
            },
            disabledSites: ["washingtonpost.com"],
            focusBlocklist: ["reddit.com"],
        });

        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: "#drawer",
                    contentUnlockSelector: "#main",
                },
            },
            networkBlocklistMeta: {
                "washingtonpost.com": {
                    source: "inspector",
                    addedAt: 20,
                },
            },
            wallAssistTraceByHostname: {
                "washingtonpost.com": {
                    domain: "washingtonpost.com",
                    status: "success",
                    summary: "Newer trace",
                    updatedAt: 20,
                    stages: [],
                },
            },
            toolActivityLog: [
                {
                    tool: "Inspector",
                    title: "Inspector Hide Saved",
                    domain: "washingtonpost.com",
                    timestamp: 10,
                },
            ],
        });
    });

    it("does not merge unrelated subdomains while cleaning legacy buckets", async () => {
        const completeSettings = {
            ...getInitialSettingsSnapshot(),
            autoAiDisabledOnce: true,
            defaultBlocklist: [],
        };

        getLocal
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({
                temporaryWallFixes: {
                    "example.com": { overlaySelector: "#root-wall" },
                    "blog.example.com": { overlaySelector: "#blog-wall" },
                },
                networkBlocklistMeta: {},
                wallAssistTraceByHostname: {},
            });

        getSync
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({
                customHidingRules: {
                    "example.com": [{ value: ".site-paywall", enabled: true }],
                    "blog.example.com": [{ value: ".blog-paywall", enabled: true }],
                },
                persistentWallFixes: {
                    "example.com": { overlaySelector: "#root-wall" },
                    "blog.example.com": { overlaySelector: "#blog-wall" },
                },
                disabledSites: ["example.com", "blog.example.com"],
                focusBlocklist: ["example.com", "blog.example.com"],
            })
            .mockResolvedValueOnce({
                settingsInitialized: true,
                autoAiDisabledOnce: true,
                defaultBlocklist: [],
            })
            .mockResolvedValueOnce(completeSettings);

        await initializeSettings();

        expect(updateSync).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
    });

    it("collapses legacy www duplicates in toggleable domain-rule lists", async () => {
        getSync
            .mockResolvedValueOnce({
                networkBlocklist: [{ value: "www.washingtonpost.com", enabled: true }, { value: "washingtonpost.com", enabled: false }],
                heuristicKeywords: getDefaultHeuristicKeywordEntries(),
                heuristicAllowlist: [{ value: "www.reuters.com", enabled: false }, { value: "reuters.com", enabled: true }],
                isolationModeSites: [{ value: "www.nytimes.com", enabled: false }, { value: "nytimes.com", enabled: true }],
                forgetfulSites: [{ value: "www.theguardian.com", enabled: true }, { value: "theguardian.com", enabled: false }],
                defaultBlocklist: getDefaultBlocklistEntries(),
            })
            .mockResolvedValueOnce({ customHidingRules: {} })
            .mockResolvedValueOnce({
                networkBlocklist: [{ value: "www.washingtonpost.com", enabled: true }, { value: "washingtonpost.com", enabled: false }],
                heuristicAllowlist: [{ value: "www.reuters.com", enabled: false }, { value: "reuters.com", enabled: true }],
                isolationModeSites: [{ value: "www.nytimes.com", enabled: false }, { value: "nytimes.com", enabled: true }],
                forgetfulSites: [{ value: "www.theguardian.com", enabled: true }, { value: "theguardian.com", enabled: false }],
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ heuristicKeywords: getDefaultHeuristicKeywordEntries() })
            .mockResolvedValueOnce({ defaultBlocklist: getDefaultBlocklistEntries() });

        await migrateStoredRules();

        expect(updateSync).toHaveBeenCalledWith(expect.objectContaining({
            networkBlocklist: [{ value: "washingtonpost.com", enabled: true }],
            heuristicAllowlist: [{ value: "reuters.com", enabled: true }],
            isolationModeSites: [{ value: "nytimes.com", enabled: true }],
            forgetfulSites: [{ value: "theguardian.com", enabled: true }],
        }));
    });

    it("normalizes old string-array domain rule lists in the same migration pass", async () => {
        getSync
            .mockResolvedValueOnce({
                networkBlocklist: ["https://*.html-load.cc/*", "www.washingtonpost.com", "washingtonpost.com"],
                heuristicKeywords: getDefaultHeuristicKeywordEntries(),
                heuristicAllowlist: ["www.reuters.com", "reuters.com"],
                isolationModeSites: ["*://*.nytimes.com/*"],
                forgetfulSites: ["www.theguardian.com", "theguardian.com"],
                defaultBlocklist: getDefaultBlocklistEntries(),
            })
            .mockResolvedValueOnce({ customHidingRules: {} })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ heuristicKeywords: getDefaultHeuristicKeywordEntries() })
            .mockResolvedValueOnce({ defaultBlocklist: getDefaultBlocklistEntries() });

        await migrateStoredRules();

        expect(updateSync).toHaveBeenCalledWith(expect.objectContaining({
            networkBlocklist: [
                { value: "html-load.cc", enabled: true },
                { value: "washingtonpost.com", enabled: true },
            ],
            heuristicAllowlist: [{ value: "reuters.com", enabled: true }],
            isolationModeSites: [{ value: "nytimes.com", enabled: true }],
            forgetfulSites: [{ value: "theguardian.com", enabled: true }],
        }));
    });
});
