import { buildSitePolicyState } from "../../src/ui/popup/state";
import { buildReviewCandidateList, buildSiteReportPackage, countReviewCandidates, getReviewCandidateSummaries } from "../../src/ui/popup/site_report";
import type { PopupSnapshot } from "../../src/ui/popup/types";

function createSnapshot(overrides: Partial<PopupSnapshot> = {}): PopupSnapshot {
    return {
        tabId: 42,
        hostname: "example.com",
        pageUrl: "https://example.com/watch?id=123",
        isExtensionPage: false,
        settings: {
            isProtectionEnabled: true,
            disabledSites: [],
            isolationModeSites: [{ value: "example.com", enabled: true }],
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
        privacyStats: {
            trackersDetected: 3,
            trackersBlocked: 2,
        },
        networkLog: [
            {
                id: 1,
                url: "https://ads.example/script.js",
                status: "blocked",
                type: "script",
                timestamp: 2_000,
                matchedRuleInfo: {
                    source: "core",
                    matchedValue: "||ads.example^",
                },
            },
            {
                id: 2,
                url: "https://prebid.example/bidder.js",
                status: "allowed",
                type: "script",
                timestamp: 1_000,
            },
            {
                id: 3,
                url: "https://example.com/app.js",
                status: "allowed",
                type: "script",
                timestamp: 1_500,
            },
        ],
        hiddenRules: [{ value: ".ad-slot", enabled: true }],
        temporaryWallFix: null,
        wallAssistTrace: null,
        hasSavedWallFix: false,
        hasRecentAiScan: true,
        ...overrides,
    };
}

describe("popup site report package", () => {
    it("formats the current site state, activity, and recent network decisions", () => {
        const snapshot = createSnapshot();
        const policy = buildSitePolicyState(snapshot);
        const report = buildSiteReportPackage(snapshot, policy, [
            {
                tool: "Popup Guard",
                title: "Popup Blocked",
                message: "Blocked a forced popup to https://ads.example/pop.",
                tone: "success",
                timestamp: 3_000,
                domain: "example.com",
            },
        ]);

        expect(report).toContain("ZenithGuard Site Report");
        expect(report).toContain("- Hostname: example.com");
        expect(report).toContain("- URL: https://example.com/watch?id=123");
        expect(report).toContain("- Isolation mode: on");
        expect(report).toContain("- Data breach warnings: on");
        expect(report).toContain("- Custom hidden rules: 1");
        expect(report).toContain("- Recent AI scan: yes");
        expect(report).toContain("Popup Guard: Popup Blocked");
        expect(report).toContain("Review Candidates");
        expect(report).toContain("prebid.example | candidate: ||prebid.example^");
        expect(report).toContain("Allowed ad-tech request observed in live traffic");
        expect(report).toContain("BLOCKED script https://ads.example/script.js");
        expect(report).toContain("rule: core / ||ads.example^");
        expect(report).toContain("ALLOWED script https://prebid.example/bidder.js");
        expect(report).toContain("ALLOWED script https://example.com/app.js");
    });

    it("adds empty placeholders when there is no activity or network log", () => {
        const snapshot = createSnapshot({
            networkLog: [],
            privacyStats: {},
            hasRecentAiScan: false,
        });
        const report = buildSiteReportPackage(snapshot, buildSitePolicyState(snapshot), []);

        expect(report).toContain("Recent Tool Activity\n- none");
        expect(report).toContain("Review Candidates\n- none");
        expect(report).toContain("Recent Network Decisions\n- none");
        expect(report).toContain("- Recent AI scan: no");
    });

    it("counts only allowed third-party ad-tech or video-ad review candidates", () => {
        const snapshot = createSnapshot({
            networkLog: [
                {
                    id: 1,
                    url: "https://prebid.example/bidder.js",
                    status: "allowed",
                    type: "script",
                    timestamp: 1_000,
                },
                {
                    id: 2,
                    url: "https://video.example/vast.xml",
                    status: "allowed",
                    type: "xmlhttprequest",
                    timestamp: 2_000,
                },
                {
                    id: 3,
                    url: "https://example.com/prebid-local.js",
                    status: "allowed",
                    type: "script",
                    timestamp: 3_000,
                },
                {
                    id: 4,
                    url: "https://doubleclick.example/tag.js",
                    status: "blocked",
                    type: "script",
                    timestamp: 4_000,
                },
            ],
        });

        expect(countReviewCandidates(snapshot.networkLog, snapshot.hostname)).toBe(2);
    });

    it("builds redacted review candidate summaries for popup preview", () => {
        const snapshot = createSnapshot({
            networkLog: [
                {
                    id: 1,
                    url: "https://prebid.example/private/path?auction=secret",
                    status: "allowed",
                    type: "script",
                    timestamp: 1_000,
                },
                {
                    id: 2,
                    url: "https://video.example/vast.xml?slot=private",
                    status: "allowed",
                    type: "xmlhttprequest",
                    timestamp: 2_000,
                },
            ],
        });

        const summaries = getReviewCandidateSummaries(snapshot.networkLog, snapshot.hostname, 2);

        expect(summaries).toEqual([
            {
                domain: "video.example",
                type: "xmlhttprequest",
                reason: "Allowed video-ad delivery request observed in live traffic",
            },
            {
                domain: "prebid.example",
                type: "script",
                reason: "Allowed ad-tech request observed in live traffic",
            },
        ]);
        expect(JSON.stringify(summaries)).not.toContain("private/path");
        expect(JSON.stringify(summaries)).not.toContain("auction=secret");
        expect(JSON.stringify(summaries)).not.toContain("slot=private");
    });

    it("builds a redacted review candidate copy list without request paths or query strings", () => {
        const snapshot = createSnapshot({
            networkLog: [
                {
                    id: 1,
                    url: "https://prebid.example/private/path?auction=secret",
                    status: "allowed",
                    type: "script",
                    timestamp: 1_000,
                },
                {
                    id: 2,
                    url: "https://video.example/vast.xml?slot=private",
                    status: "allowed",
                    type: "xmlhttprequest",
                    timestamp: 2_000,
                },
            ],
        });

        const reviewList = buildReviewCandidateList(snapshot);

        expect(reviewList).toContain("ZenithGuard Review Candidates");
        expect(reviewList).toContain("- Hostname: example.com");
        expect(reviewList).toContain("video.example | candidate: ||video.example^ | type: xmlhttprequest");
        expect(reviewList).toContain("prebid.example | candidate: ||prebid.example^ | type: script");
        expect(reviewList).not.toContain("private/path");
        expect(reviewList).not.toContain("auction=secret");
        expect(reviewList).not.toContain("vast.xml");
        expect(reviewList).not.toContain("slot=private");
    });
});
