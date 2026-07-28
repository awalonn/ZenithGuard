import { jest } from "@jest/globals";
import type { AnalyzerNetworkLogEntry, AnalyzerRawResult } from "../../src/ui/analyzer/types";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const getLocal = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const addToNetworkBlocklist = jest.fn<AsyncMock>();
const sendMessage = jest.fn<AsyncMock>();
const openSettingsPage = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
}));

jest.unstable_mockModule("../../src/ui/analyzer/loaders", () => ({
    loadAnalyzerNetworkLog: jest.fn(),
    loadAnalyzerSupportData: jest.fn(),
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    addToNetworkBlocklist,
    analyzePageWithAi: jest.fn(),
    sendMessage,
}));

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openLoggerPage: jest.fn(),
    openSettingsPage,
}));

const {
    buildReport,
    addFindingToBlocklist,
    manageFindingInRules,
    removeFindingFromCustomBlocklist,
} = await import("../../src/ui/analyzer/analyzer_controller");

describe("analyzer report building", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        addToNetworkBlocklist.mockReset();
        openSettingsPage.mockReset();
        sendMessage.mockReset();
        sendMessage.mockResolvedValue({ success: true });
        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                sendMessage: jest.fn(() => Promise.resolve({ success: true })),
            },
        } as unknown as typeof chrome;
    });

    it("preserves custom coverage, dedupes repeated findings, and computes actionable counts", () => {
        const rawResult: AnalyzerRawResult = {
            networkThreats: [
                { url: "https://cdn.example.com/pixel.js", reason: "Telemetry pixel" },
                { url: "https://cdn.example.com/pixel.js", reason: "Telemetry pixel" },
                { url: "https://ads.example.net/tag.js", reason: "Ad script" },
            ],
            heuristicMatches: [
                { url: "https://ads.example.net/tag.js", keyword: "third-party-ads" },
            ],
            visualAnnoyances: [{ description: "Sticky ad rail" }],
            darkPatterns: [{ patternName: "Countdown", description: "Urgency timer" }],
        };

        const networkLog: AnalyzerNetworkLogEntry[] = [
            {
                id: 1,
                url: "https://cdn.example.com/pixel.js",
                status: "blocked",
                matchedRuleInfo: {
                    source: "Network Blocklist",
                    matchedValue: "example.com",
                },
            },
            {
                id: 2,
                url: "https://ads.example.net/tag.js",
                status: "allowed",
            },
        ];

        const report = buildReport(rawResult, networkLog, {
            networkBlocklist: ["example.com"],
            defaultBlocklist: [],
            networkBlocklistMeta: {
                "example.com": {
                    source: "logger",
                },
            },
        });

        expect(report.counts).toEqual({
            networkThreats: 2,
            visualAnnoyances: 1,
            heuristicIssues: 1,
            darkPatterns: 1,
        });
        expect(report.grade).toBe("B");
        expect(report.gradeLabel).toBe("Mild concerns");
        expect(report.needsAction.needsAction).toBe(1);
        expect(report.observedCounts).toEqual({ blocked: 1, seen: 1 });
        expect(report.observedWindow.sessionScope).toContain("Observed traffic from the current page load");

        expect(report.findings.network[0]).toMatchObject({
            domain: "cdn.example.com",
            isBlocked: true,
            coverageTone: "custom",
            coverageLabel: "Added from Logger",
            matchedRuleValue: "example.com",
            observedStatus: "blocked",
            evidenceCount: 1,
        });

        expect(report.findings.network[1]).toMatchObject({
            domain: "ads.example.net",
            isBlocked: false,
            observedStatus: "seen",
        });

        expect(report.findings.heuristic[0]).toMatchObject({
            domain: "ads.example.net",
            observedStatus: "seen",
        });
    });

    it("returns an A-grade clean report when no findings exist", () => {
        const report = buildReport(
            {},
            [],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.grade).toBe("A");
        expect(report.gradeLabel).toBe("Low exposure");
        expect(report.executiveSummary).toContain("unusually clean");
        expect(report.needsAction).toEqual({ needsAction: 0 });
        expect(report.observedCounts).toEqual({ blocked: 0, seen: 0 });
    });

    it("adds observed allowed ad-tech requests as actionable local findings", () => {
        const report = buildReport(
            {},
            [
                {
                    id: 1,
                    url: "https://securepubads.g.doubleclick.net/gampad/ads?slot=hero",
                    status: "allowed",
                    initiator: "https://www.zerogpt.com/",
                },
            ],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.counts.networkThreats).toBe(1);
        expect(report.needsAction).toEqual({ needsAction: 1 });
        expect(report.findings.network[0]).toMatchObject({
            domain: "securepubads.g.doubleclick.net",
            blocklistCandidate: "securepubads.g.doubleclick.net",
            isBlocked: false,
            observedStatus: "seen",
            description: "https://securepubads.g.doubleclick.net/gampad/ads?slot=hero - Allowed video-ad delivery request observed in live traffic",
        });
    });

    it("adds observed allowed video-ad delivery requests as actionable local findings", () => {
        const report = buildReport(
            {},
            [
                {
                    id: 1,
                    url: "https://imasdk.googleapis.com/js/sdkloader/ima3.js",
                    status: "allowed",
                    type: "script",
                    initiator: "https://www.zerogpt.com/",
                },
            ],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.counts.networkThreats).toBe(1);
        expect(report.needsAction).toEqual({ needsAction: 1 });
        expect(report.findings.network[0]).toMatchObject({
            domain: "imasdk.googleapis.com",
            blocklistCandidate: "imasdk.googleapis.com",
            isBlocked: false,
            observedStatus: "seen",
            description: "https://imasdk.googleapis.com/js/sdkloader/ima3.js - Allowed video-ad delivery request observed in live traffic",
        });
    });

    it("does not add local video-ad findings for ordinary third-party video delivery", () => {
        const report = buildReport(
            {},
            [
                {
                    id: 1,
                    url: "https://cdn.videoplatform.example/media/lesson-video.m3u8",
                    status: "allowed",
                    type: "media",
                    initiator: "https://www.publisher.example/article",
                },
            ],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.counts.networkThreats).toBe(0);
        expect(report.needsAction).toEqual({ needsAction: 0 });
    });

    it("does not add local ad-tech findings for same-site requests", () => {
        const report = buildReport(
            {},
            [
                {
                    id: 1,
                    url: "https://www.publisher.example/assets/pubads_impl.js",
                    status: "allowed",
                    initiator: "https://www.publisher.example/article",
                },
            ],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.counts.networkThreats).toBe(0);
        expect(report.needsAction).toEqual({ needsAction: 0 });
    });

    it("does not add local ad-tech findings for requests already covered by built-in rules", () => {
        const report = buildReport(
            {},
            [
                {
                    id: 1,
                    url: "https://securepubads.g.doubleclick.net/gampad/ads?slot=hero",
                    status: "allowed",
                },
            ],
            {
                networkBlocklist: [],
                defaultBlocklist: ["||securepubads.g.doubleclick.net^"],
                networkBlocklistMeta: {},
            },
        );

        expect(report.counts.networkThreats).toBe(0);
        expect(report.needsAction).toEqual({ needsAction: 0 });
    });

    it("treats built-in decorated rules as hostname coverage in analyzer findings", () => {
        const report = buildReport(
            {
                networkThreats: [
                    { url: "https://static.doubleclick.net/tag.js", reason: "Ad script" },
                ],
            },
            [],
            {
                networkBlocklist: [],
                defaultBlocklist: ["||doubleclick.net^"],
                networkBlocklistMeta: {},
            },
        );

        expect(report.findings.network[0]).toMatchObject({
            domain: "static.doubleclick.net",
            isBlocked: true,
            coverageTone: "built-in",
            coverageLabel: "Built-in rule",
            matchedRuleValue: "doubleclick.net",
        });
        expect(report.needsAction).toEqual({ needsAction: 0 });
    });

    it("treats apex findings as covered when a custom rule is stored on the www variant", () => {
        const report = buildReport(
            {
                networkThreats: [
                    { url: "https://reuters.com/pixel.js", reason: "Telemetry pixel" },
                ],
            },
            [],
            {
                networkBlocklist: ["www.reuters.com"],
                defaultBlocklist: [],
                networkBlocklistMeta: {
                    "www.reuters.com": {
                        source: "settings",
                    },
                },
            },
        );

        expect(report.findings.network[0]).toMatchObject({
            domain: "reuters.com",
            isBlocked: true,
            coverageTone: "custom",
            coverageLabel: "Added in Settings",
            matchedRuleValue: "www.reuters.com",
        });
        expect(report.needsAction).toEqual({ needsAction: 0 });
    });

    it("preserves custom coverage labels when metadata is stored on the www variant", () => {
        const report = buildReport(
            {
                networkThreats: [
                    { url: "https://reuters.com/pixel.js", reason: "Telemetry pixel" },
                ],
            },
            [],
            {
                networkBlocklist: ["reuters.com"],
                defaultBlocklist: [],
                networkBlocklistMeta: {
                    "www.reuters.com": {
                        source: "settings",
                    },
                },
            },
        );

        expect(report.findings.network[0]).toMatchObject({
            domain: "reuters.com",
            isBlocked: true,
            coverageTone: "custom",
            coverageLabel: "Added in Settings",
            matchedRuleValue: "reuters.com",
        });
    });

    it("carries observed-window timing when the network log snapshot includes session metadata", () => {
        const report = buildReport(
            {
                networkThreats: [
                    { url: "https://ads.example.net/tag.js", reason: "Ad script" },
                ],
            },
            {
                entries: [
                    {
                        id: 1,
                        url: "https://ads.example.net/tag.js",
                        status: "allowed",
                    },
                ],
                sessionStartedAt: new Date("2026-03-30T11:05:00Z").getTime(),
                lastUpdatedAt: new Date("2026-03-30T11:05:03Z").getTime(),
            },
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        expect(report.observedWindow.sessionScope).toContain("Observed traffic from the current page load since");
        expect(report.observedWindow.sessionStartedAtLabel).not.toBe("");
        expect(report.observedWindow.lastUpdatedAtLabel).not.toBe("");
    });

    it("extracts a real hostname from wildcard-style threat URLs so add-to-blocklist uses a valid domain", async () => {
        const report = buildReport(
            {
                networkThreats: [
                    {
                        url: "https:///*.html-load.cc/*",
                        reason: "Suspicious domain pattern associated with aggressive ad-delivery.",
                    },
                ],
            },
            [],
            {
                networkBlocklist: [],
                defaultBlocklist: [],
                networkBlocklistMeta: {},
            },
        );

        const finding = report.findings.network[0];
        expect(finding).toMatchObject({
            domain: "html-load.cc",
            blocklistCandidate: "html-load.cc",
            isBlocked: false,
        });

        addToNetworkBlocklist.mockResolvedValue({ success: true });
        const result = await addFindingToBlocklist(finding);

        expect(addToNetworkBlocklist).toHaveBeenCalledWith("html-load.cc", "analyzer");
        expect(result).toEqual({ success: true, status: "added", message: undefined });
    });

    it("reports an existing blocklist rule without treating it as a fresh Analyzer add", async () => {
        const finding = {
            domain: "ads.example.net",
            blocklistCandidate: "ads.example.net",
        } as any;

        addToNetworkBlocklist.mockResolvedValue({ success: false, message: "Rule already exists." });
        const result = await addFindingToBlocklist(finding);

        expect(addToNetworkBlocklist).toHaveBeenCalledWith("ads.example.net", "analyzer");
        expect(result).toEqual({
            success: true,
            status: "existing",
            message: "Rule already exists.",
        });
    });

    it("deep-links rule management to the matching Network Blocklist entry", async () => {
        openSettingsPage.mockResolvedValue(undefined);

        await manageFindingInRules({
            domain: "ads.example.net",
            description: "Ad script",
            isBlocked: true,
        } as any);

        expect(openSettingsPage).toHaveBeenCalledWith({
            section: "my-rules",
            domain: "ads.example.net",
            focus: "network-blocklist",
        });
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

        await removeFindingFromCustomBlocklist({
            domain: "reuters.com",
            matchedRuleValue: "reuters.com",
            description: "Telemetry pixel",
            isBlocked: true,
        } as any);

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

        await removeFindingFromCustomBlocklist({
            domain: "reuters.com",
            matchedRuleValue: "reuters.com",
            description: "Telemetry pixel",
            isBlocked: true,
        } as any);

        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "ads.example.net": { source: "logger", addedAt: 30 },
            },
        });
    });

    it("removes only the matched custom rule and preserves related hostname rules", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [
                { value: "example.com", enabled: true },
                { value: "ads.example.com", enabled: true },
                { value: "metrics.ads.example.com", enabled: false },
                { value: "cdn.example.com", enabled: true },
            ],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "example.com": { source: "settings", addedAt: 10 },
                "ads.example.com": { source: "analyzer", addedAt: 20 },
                "metrics.ads.example.com": { source: "logger", addedAt: 30 },
                "cdn.example.com": { source: "inspector", addedAt: 40 },
            },
        });

        await removeFindingFromCustomBlocklist({
            domain: "pixel.ads.example.com",
            matchedRuleValue: "ads.example.com",
            description: "Telemetry pixel",
            isBlocked: true,
        } as any);

        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [
                { value: "example.com", enabled: true },
                { value: "metrics.ads.example.com", enabled: false },
                { value: "cdn.example.com", enabled: true },
            ],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "example.com": { source: "settings", addedAt: 10 },
                "metrics.ads.example.com": { source: "logger", addedAt: 30 },
                "cdn.example.com": { source: "inspector", addedAt: 40 },
            },
        });
    });

    it("supports legacy string rules without deleting related hostnames", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [
                "www.reuters.com",
                "pixel.reuters.com",
                "unrelated.example",
            ],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "reuters.com": { source: "settings" },
                "pixel.reuters.com": { source: "logger" },
            },
        });

        await removeFindingFromCustomBlocklist({
            domain: "reuters.com",
            matchedRuleValue: "reuters.com",
            description: "Telemetry pixel",
            isBlocked: true,
        } as any);

        expect(setSync).toHaveBeenCalledWith({
            networkBlocklist: [
                "pixel.reuters.com",
                "unrelated.example",
            ],
        });
        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "pixel.reuters.com": { source: "logger" },
            },
        });
    });
});
