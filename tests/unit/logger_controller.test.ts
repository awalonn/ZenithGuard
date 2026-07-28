import { jest } from "@jest/globals";
import type { LoggerEntry, LoggerVisibleEntry } from "../../src/ui/logger/types";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const getLocal = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const sendMessage = jest.fn<AsyncMock>();
const addToNetworkBlocklist = jest.fn<AsyncMock>();
const openSettingsPage = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    addToNetworkBlocklist,
    isNetworkLogResetMessage: (message: { type?: string }) => message.type === "NETWORK_LOG_RESET",
    isNetworkLogUpdateMessage: (message: { type?: string }) => message.type === "NETWORK_LOG_UPDATE",
    sendMessage,
}));

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openAnalyzerPage: jest.fn(),
    openSettingsPage,
}));

const {
    addLoggerEntryToBlocklist,
    addLoggerVisibleFiltersToBlocklist,
    undoLoggerBulkAddedFilters,
    removeLoggerCustomBlock,
    attachDynamicLoggerMessageListener,
    attachLoggerMessageListener,
    buildLoggerDomainFilter,
    buildLoggerDomainFilterList,
    buildLoggerReviewList,
    filterLoggerEntries,
    getActiveFilterTags,
    getLoggerBulkAddFiltersLabel,
    getLoggerBulkBlockCandidates,
    getLoggerDomainFilterCopyLabel,
    getLoggerDomainFilterListCopyLabel,
    getLoggerDomainFilterListCount,
    getLoggerCoverage,
    getLoggerReviewCount,
    getLoggerStats,
    mapVisibleEntry,
    manageLoggerEntryInRules,
} = await import("../../src/ui/logger/logger_controller");

function createEntry(overrides: Partial<LoggerEntry> = {}): LoggerEntry {
    return {
        id: 1,
        url: "https://cdn.example.com/script.js",
        initiator: "https://www.example.com/article",
        timestamp: Date.now(),
        status: "allowed",
        type: "script",
        matchedRuleInfo: {},
        ...overrides,
    };
}

describe("logger controller helpers", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        sendMessage.mockReset();
        addToNetworkBlocklist.mockReset();
        openSettingsPage.mockReset();

        let messageListener: ((message: unknown) => void) | null = null;
        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn((listener: (message: unknown) => void) => {
                        messageListener = listener;
                    }),
                    removeListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;

        (globalThis as { __loggerTestEmitMessage?: (message: unknown) => void }).__loggerTestEmitMessage = (message) => {
            messageListener?.(message);
        };
    });

    it("maps custom blocklist entries with the stored origin label", () => {
        const visible = mapVisibleEntry(
            createEntry({
                status: "blocked",
                matchedRuleInfo: {
                    source: "Network Blocklist",
                    category: "User",
                    matchedValue: "example-cdn.com",
                },
                url: "https://example-cdn.com/tracker.js",
            }),
            {
                networkBlocklist: ["example-cdn.com"],
                defaultBlocklist: [],
                networkBlocklistMeta: {
                    "example-cdn.com": { source: "inspector" },
                },
            },
        );

        expect(visible.customMatchedValue).toBe("example-cdn.com");
        expect(visible.customOriginLabel).toBe("Added from Inspector");
        expect(visible.family).toBe("user");
    });

    it("deep-links rule management to the matching Network Blocklist entry", async () => {
        openSettingsPage.mockResolvedValue(undefined);
        const entry = mapVisibleEntry(createEntry({
            url: "https://ads.example.net/tag.js",
        }), {
            networkBlocklist: [],
            defaultBlocklist: [],
            networkBlocklistMeta: {},
        });

        await manageLoggerEntryInRules(entry);

        expect(openSettingsPage).toHaveBeenCalledWith({
            section: "my-rules",
            domain: "ads.example.net",
            focus: "network-blocklist",
        });
    });

    it("maps custom origin labels across www/apex metadata variants", () => {
        const visible = mapVisibleEntry(
            createEntry({
                status: "blocked",
                matchedRuleInfo: {
                    source: "Network Blocklist",
                    category: "User",
                    matchedValue: "reuters.com",
                },
                url: "https://reuters.com/tracker.js",
            }),
            {
                networkBlocklist: ["reuters.com"],
                defaultBlocklist: [],
                networkBlocklistMeta: {
                    "www.reuters.com": { source: "settings" },
                },
            },
        );

        expect(visible.customMatchedValue).toBe("reuters.com");
        expect(visible.customOriginLabel).toBe("Added in Settings");
    });

    it("marks uncovered allowed third-party entries as needing review", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://ads.example.net/ad.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(visible.domain).toBe("ads.example.net");
        expect(visible.customBlockCandidate).toBe("ads.example.net");
        expect(visible.canAddCustomBlock).toBe(true);
        expect(visible.needsReview).toBe(true);
        expect(visible.reviewReason).toBe(null);
    });

    it("explains uncovered allowed video-ad delivery requests", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                initiator: "https://www.zerogpt.com/",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(visible.customBlockCandidate).toBe("imasdk.googleapis.com");
        expect(visible.canAddCustomBlock).toBe(true);
        expect(visible.reviewReason).toBe("Allowed video-ad delivery request observed in live traffic");
    });

    it("does not invent video-ad reasons for ordinary third-party video delivery", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://cdn.videoplatform.example/media/lesson-video.m3u8",
                initiator: "https://training.example.com/course",
                status: "allowed",
                type: "media",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(visible.canAddCustomBlock).toBe(true);
        expect(visible.reviewReason).toBe(null);
    });

    it("adds logger custom blocks using the displayed candidate", async () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://ads.example.net/ad.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );
        addToNetworkBlocklist.mockResolvedValue({ success: true });
        sendMessage.mockResolvedValue({ success: true });

        const result = await addLoggerEntryToBlocklist(visible);

        expect(addToNetworkBlocklist).toHaveBeenCalledWith("ads.example.net", "logger");
        expect(sendMessage).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" });
        expect(result).toEqual({ success: true, message: undefined });
    });

    it("does not mark covered allowed entries as needing review", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://ads.example.net/ad.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: ["ads.example.net"],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(visible.canAddCustomBlock).toBe(false);
        expect(visible.needsReview).toBe(false);
    });

    it("does not mark built-in decorated domain rules as uncovered", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://static.doubleclick.net/tag.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: ["||doubleclick.net^"],
                networkBlocklistMeta: {},
            },
        );

        expect(visible.canAddCustomBlock).toBe(false);
        expect(visible.needsReview).toBe(false);
    });

    it("does not mark apex requests as uncovered when a custom rule is stored on the www variant", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://reuters.com/pixel.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: ["www.reuters.com"],
                defaultBlocklist: [],
                networkBlocklistMeta: {
                    "www.reuters.com": { source: "settings" },
                },
            },
        );

        expect(visible.canAddCustomBlock).toBe(false);
        expect(visible.needsReview).toBe(false);
    });

    it("filters entries by status, source, family, and free-text search", () => {
        const entries: LoggerVisibleEntry[] = [
            {
                ...mapVisibleEntry(
                    createEntry({
                        url: "https://mgid.com/widget.js",
                        status: "blocked",
                        matchedRuleInfo: {
                            source: "Built-in",
                            category: "Built-in",
                            detail: "Matched built-in rule",
                        },
                    }),
                    {
                        networkBlocklist: [],
                        defaultBlocklist: ["mgid.com"],
                        networkBlocklistMeta: {},
                    },
                ),
            },
            {
                ...mapVisibleEntry(
                    createEntry({
                        id: 2,
                        url: "https://cdn.example.com/app.js",
                        status: "allowed",
                        matchedRuleInfo: {
                            source: "Network Blocklist",
                            category: "User",
                            matchedValue: "cdn.example.com",
                        },
                    }),
                    {
                        networkBlocklist: ["cdn.example.com"],
                        defaultBlocklist: [],
                        networkBlocklistMeta: {
                            "cdn.example.com": { source: "logger" },
                        },
                    },
                ),
            },
        ];

        const filtered = filterLoggerEntries(entries, {
            status: "blocked",
            review: "all",
            family: "built-in",
            source: "Built-in",
            search: "mgid",
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].url).toContain("mgid.com");
    });

    it("filters entries to allowed requests that need manual review", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    url: "https://ads.example.net/ad.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://cdn.example.com/app.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: ["cdn.example.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 3,
                    url: "https://tracker.example.org/pixel.js",
                    initiator: "https://news.example.com/story",
                    status: "blocked",
                }),
                {
                    networkBlocklist: ["tracker.example.org"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        const filtered = filterLoggerEntries(entries, {
            status: "allowed",
            review: "needs-review",
            family: "all",
            source: null,
            search: "",
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].domain).toBe("ads.example.net");
    });

    it("counts allowed third-party requests that need manual review", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    url: "https://ads.example.net/ad.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://cdn.example.com/app.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: ["cdn.example.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        expect(getLoggerReviewCount(entries)).toBe(1);
    });

    it("builds a copyable review list for allowed third-party misses", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://cdn.example.com/app.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: ["cdn.example.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        const report = buildLoggerReviewList(entries, "ZeroGPT");

        expect(report).toContain("ZenithGuard Review Candidates");
        expect(report).toContain("- Hostname: ZeroGPT");
        expect(report).toContain("imasdk.googleapis.com | candidate: ||imasdk.googleapis.com^ | type: script");
        expect(report).toContain("Allowed video-ad delivery request observed in live traffic");
        expect(report).not.toContain("cdn.example.com");
        expect(report).not.toContain("/js/sdkloader/ima3.js");
        expect(report).not.toContain("URL:");
    });

    it("builds an ABP-style domain filter for a reviewable logger row", () => {
        const visible = mapVisibleEntry(
            createEntry({
                url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                initiator: "https://www.zerogpt.com/",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(buildLoggerDomainFilter(visible)).toBe("||imasdk.googleapis.com^");
    });

    it("keeps decorated logger filter candidates unchanged when copying a row filter", () => {
        const visible = {
            ...mapVisibleEntry(
                createEntry({
                    url: "https://ads.example.net/ad.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            customBlockCandidate: "||ads.example.net^",
        };

        expect(buildLoggerDomainFilter(visible)).toBe("||ads.example.net^");
    });

    it("builds a deduped domain-filter list from visible reviewable logger rows", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    id: 1,
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://imasdk.googleapis.com/vpaid/loader.js?slot=top",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 3,
                    url: "https://ads.example.net/ad.js?campaign=private",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 4,
                    url: "https://cdn.example.com/app.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: ["cdn.example.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        const list = buildLoggerDomainFilterList(entries);

        expect(list).toBe("||imasdk.googleapis.com^\n||ads.example.net^");
        expect(getLoggerDomainFilterListCount(entries)).toBe(2);
        expect(list).not.toContain("/js/sdkloader");
        expect(list).not.toContain("campaign=private");
        expect(list).not.toContain("cdn.example.com");
    });

    it("collects deduped custom block candidates from visible reviewable logger rows", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    id: 1,
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://imasdk.googleapis.com/vpaid/loader.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 3,
                    url: "https://cdn.example.com/app.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: ["cdn.example.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        expect(getLoggerBulkBlockCandidates(entries)).toEqual(["imasdk.googleapis.com"]);
    });

    it("bulk adds visible review filters to the custom blocklist and applies rules once", async () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    id: 1,
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://ads.example.net/ad.js?campaign=private",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];
        getSync.mockResolvedValue({
            networkBlocklist: [{ value: "existing.example", enabled: true }],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "existing.example": { source: "settings", addedAt: 10 },
            },
        });
        setSync.mockResolvedValue(undefined);
        setLocal.mockResolvedValue(undefined);
        sendMessage.mockResolvedValue({ success: true });

        const result = await addLoggerVisibleFiltersToBlocklist(entries);

        expect(result).toEqual({
            success: true,
            added: 2,
            addedFilters: ["imasdk.googleapis.com", "ads.example.net"],
            message: "Added 2 new filters.",
        });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [
                { value: "existing.example", enabled: true },
                { value: "imasdk.googleapis.com", enabled: true },
                { value: "ads.example.net", enabled: true },
            ],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "existing.example": { source: "settings", addedAt: 10 },
                "imasdk.googleapis.com": { source: "logger", addedAt: expect.any(Number) },
                "ads.example.net": { source: "logger", addedAt: expect.any(Number) },
            },
        });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" });
        expect(addToNetworkBlocklist).not.toHaveBeenCalled();
    });

    it("preserves existing origin metadata when bulk add re-enables a disabled rule", async () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    id: 1,
                    url: "https://ads.example.net/ad.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];
        getSync.mockResolvedValue({
            networkBlocklist: [{ value: "ads.example.net", enabled: false }],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "ads.example.net": { source: "settings", addedAt: 10 },
            },
        });
        setSync.mockResolvedValue(undefined);
        setLocal.mockResolvedValue(undefined);
        sendMessage.mockResolvedValue({ success: true });

        const result = await addLoggerVisibleFiltersToBlocklist(entries);

        expect(result).toEqual({
            success: true,
            added: 1,
            addedFilters: [],
            message: "Re-enabled 1 existing filter.",
        });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [{ value: "ads.example.net", enabled: true }],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "ads.example.net": { source: "settings", addedAt: 10 },
            },
        });
    });

    it("describes mixed bulk adds and re-enabled existing rules", async () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    id: 1,
                    url: "https://ads.example.net/ad.js",
                    initiator: "https://news.example.com/story",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];
        getSync.mockResolvedValue({
            networkBlocklist: [{ value: "ads.example.net", enabled: false }],
        });
        getLocal.mockResolvedValue({ networkBlocklistMeta: {} });
        setSync.mockResolvedValue(undefined);
        setLocal.mockResolvedValue(undefined);
        sendMessage.mockResolvedValue({ success: true });

        const result = await addLoggerVisibleFiltersToBlocklist(entries);

        expect(result).toEqual({
            success: true,
            added: 2,
            addedFilters: ["imasdk.googleapis.com"],
            message: "Added 1 new filter and re-enabled 1 existing filter.",
        });
    });

    it("undoes only filters created by the last bulk add and applies rules once", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [
                { value: "existing.example", enabled: true },
                { value: "imasdk.googleapis.com", enabled: true },
                { value: "ads.example.net", enabled: true },
            ],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "existing.example": { source: "settings", addedAt: 10 },
                "imasdk.googleapis.com": { source: "logger", addedAt: 20 },
                "ads.example.net": { source: "logger", addedAt: 20 },
            },
        });
        setSync.mockResolvedValue(undefined);
        setLocal.mockResolvedValue(undefined);
        sendMessage.mockResolvedValue({ success: true });

        const result = await undoLoggerBulkAddedFilters(["imasdk.googleapis.com", "ads.example.net"]);

        expect(result).toEqual({ success: true, removed: 2, message: "Removed 2 filters." });
        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [
                { value: "existing.example", enabled: true },
            ],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "existing.example": { source: "settings", addedAt: 10 },
            },
        });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" });
    });

    it("labels only the copied logger row as copied", () => {
        const first = mapVisibleEntry(
            createEntry({
                id: 10,
                url: "https://ads.example.net/ad.js",
                initiator: "https://news.example.com/story",
                status: "allowed",
            }),
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );
        const second = {
            ...first,
            id: 11,
        };

        expect(getLoggerDomainFilterCopyLabel(first, 10)).toBe("Copied filter");
        expect(getLoggerDomainFilterCopyLabel(second, 10)).toBe("Copy domain filter");
    });

    it("labels bulk filter copy actions with the visible unique filter count", () => {
        expect(getLoggerDomainFilterListCopyLabel(0, "")).toBe("Copy 0 Filters");
        expect(getLoggerDomainFilterListCopyLabel(1, "")).toBe("Copy 1 Filter");
        expect(getLoggerDomainFilterListCopyLabel(3, "")).toBe("Copy 3 Filters");
        expect(getLoggerDomainFilterListCopyLabel(3, "copied")).toBe("Copied 3 Filters");
    });

    it("labels bulk filter add actions with the visible unique filter count", () => {
        expect(getLoggerBulkAddFiltersLabel(0, "")).toBe("Add 0 Filters");
        expect(getLoggerBulkAddFiltersLabel(1, "")).toBe("Add 1 Filter");
        expect(getLoggerBulkAddFiltersLabel(1, "confirming")).toBe("Confirm Add 1 Filter");
        expect(getLoggerBulkAddFiltersLabel(3, "confirming")).toBe("Confirm Add 3 Filters");
        expect(getLoggerBulkAddFiltersLabel(3, "adding")).toBe("Adding 3 Filters");
        expect(getLoggerBulkAddFiltersLabel(3, "added")).toBe("Updated 3 Filters");
    });

    it("filters entries by ad-tech review reason", () => {
        const entries = [
            mapVisibleEntry(
                createEntry({
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    initiator: "https://www.zerogpt.com/",
                    status: "allowed",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
            mapVisibleEntry(
                createEntry({
                    id: 2,
                    url: "https://cdn.videoplatform.example/media/lesson-video.m3u8",
                    initiator: "https://training.example.com/course",
                    status: "allowed",
                    type: "media",
                }),
                {
                    networkBlocklist: [],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {},
                },
            ),
        ];

        const filtered = filterLoggerEntries(entries, {
            status: "all",
            review: "all",
            family: "all",
            source: null,
            search: "video-ad delivery",
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].url).toContain("imasdk.googleapis.com");
    });

    it("builds active filter tags and coverage summaries from visible log data", () => {
        const entries = [
            createEntry({
                status: "blocked",
                matchedRuleInfo: { source: "Malware Protection", category: "Security" },
            }),
            createEntry({
                id: 2,
                status: "modified",
                matchedRuleInfo: { source: "URL Cleaner", category: "Privacy" },
            }),
        ];

        expect(
            getActiveFilterTags({
                status: "modified",
                review: "needs-review",
                family: "privacy",
                source: "URL Cleaner",
                search: "utm_",
            }),
        ).toEqual([
            { id: "status", label: "Status: cleaned" },
            { id: "family", label: "Family: Privacy" },
            { id: "review", label: "Review: allowed third-party misses" },
            { id: "source", label: "Source: URL Cleaner" },
            { id: "search", label: "Search: utm_" },
        ]);

        const coverage = getLoggerCoverage(entries);
        expect(coverage.topFamilies).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ family: "security", label: "Security", count: 1 }),
                expect.objectContaining({ family: "privacy", label: "Privacy", count: 1 }),
            ]),
        );
        expect(coverage.topSources).toEqual(
            expect.arrayContaining([
                { source: "Malware Protection", count: 1 },
                { source: "URL Cleaner", count: 1 },
            ]),
        );
    });

    it("describes the logger as the current page load when session metadata is present", () => {
        const startedAt = new Date("2026-03-30T10:52:14Z").getTime();
        const lastUpdatedAt = new Date("2026-03-30T10:52:19Z").getTime();

        const stats = getLoggerStats(
            [createEntry({ status: "blocked" })],
            [mapVisibleEntry(createEntry({ status: "blocked" }), {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            })],
            7,
            startedAt,
            lastUpdatedAt,
        );

        expect(stats.session).toBe("Live page load");
        expect(stats.sessionScope).toContain("Requests since the last top-level navigation");
        expect(stats.sessionStartedAtLabel).not.toBe("");
        expect(stats.lastUpdatedAtLabel).not.toBe("");
    });

    it("notifies the logger when the live page load resets", () => {
        const updates: LoggerEntry[] = [];
        const resets: Array<number | null> = [];

        const detach = attachLoggerMessageListener(
            7,
            (entry) => updates.push(entry),
            (sessionStartedAt) => resets.push(sessionStartedAt),
        );

        (globalThis as { __loggerTestEmitMessage?: (message: unknown) => void }).__loggerTestEmitMessage?.({
            type: "NETWORK_LOG_RESET",
            tabId: 7,
            sessionStartedAt: 1234,
        });

        expect(updates).toEqual([]);
        expect(resets).toEqual([1234]);

        detach();
    });

    it("follows the current tab id when the logger is not pinned to one tab", () => {
        const updates: LoggerEntry[] = [];
        let currentTabId = 7;

        const detach = attachDynamicLoggerMessageListener(
            () => currentTabId,
            (entry) => updates.push(entry),
        );

        (globalThis as { __loggerTestEmitMessage?: (message: unknown) => void }).__loggerTestEmitMessage?.({
            type: "NETWORK_LOG_UPDATE",
            tabId: 7,
            log: createEntry({ id: 1, url: "https://first.example.com/script.js" }),
        });

        currentTabId = 8;

        (globalThis as { __loggerTestEmitMessage?: (message: unknown) => void }).__loggerTestEmitMessage?.({
            type: "NETWORK_LOG_UPDATE",
            tabId: 7,
            log: createEntry({ id: 2, url: "https://ignored.example.com/script.js" }),
        });

        (globalThis as { __loggerTestEmitMessage?: (message: unknown) => void }).__loggerTestEmitMessage?.({
            type: "NETWORK_LOG_UPDATE",
            tabId: 8,
            log: createEntry({ id: 3, url: "https://second.example.com/script.js" }),
        });

        expect(updates.map((entry) => entry.id)).toEqual([1, 3]);

        detach();
    });

    it("removes custom blocklist entries across www/apex metadata variants", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [
                { value: "www.reuters.com", enabled: true },
                { value: "ads.example.net", enabled: true },
            ],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "www.reuters.com": { source: "settings" },
                "ads.example.net": { source: "logger" },
            },
        });
        sendMessage.mockResolvedValue({ success: true });

        await removeLoggerCustomBlock({
            ...mapVisibleEntry(
                createEntry({
                    status: "blocked",
                    matchedRuleInfo: {
                        source: "Network Blocklist",
                        category: "User",
                        matchedValue: "reuters.com",
                    },
                    url: "https://reuters.com/pixel.js",
                }),
                {
                    networkBlocklist: ["reuters.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {
                        "www.reuters.com": { source: "settings" },
                    },
                },
            ),
        });

        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [
                { value: "ads.example.net", enabled: true },
            ],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "ads.example.net": { source: "logger" },
            },
        });
        expect(sendMessage).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" });
    });

    it("collapses legacy sibling metadata buckets when removing a custom block", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [
                { value: "www.reuters.com", enabled: true },
                { value: "ads.example.net", enabled: true },
            ],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "www.reuters.com": { source: "logger", addedAt: 10 },
                "reuters.com": { source: "settings", addedAt: 20 },
                "ads.example.net": { source: "logger", addedAt: 30 },
            },
        });
        sendMessage.mockResolvedValue({ success: true });

        await removeLoggerCustomBlock({
            ...mapVisibleEntry(
                createEntry({
                    status: "blocked",
                    matchedRuleInfo: {
                        source: "Network Blocklist",
                        category: "User",
                        matchedValue: "reuters.com",
                    },
                    url: "https://reuters.com/pixel.js",
                }),
                {
                    networkBlocklist: ["reuters.com"],
                    defaultBlocklist: [],
                    networkBlocklistMeta: {
                        "reuters.com": { source: "settings", addedAt: 20 },
                    },
                },
            ),
        });

        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "ads.example.net": { source: "logger", addedAt: 30 },
            },
        });
    });
});
