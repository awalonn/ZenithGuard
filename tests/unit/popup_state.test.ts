import {
    buildSitePolicyState,
    getBestNextMove,
    getCosmeticCleanupSummary,
    getFocusModeLabel,
    getHeroToggleChecked,
    getHeroToggleLabel,
    getRecentCosmeticCleanupActivity,
    getRecentNotableActivity,
    getSitePolicySummary,
    getWallFixLabel,
} from "../../src/ui/popup/state";
import type { PopupSnapshot } from "../../src/ui/popup/types";

function createSnapshot(overrides: Partial<PopupSnapshot> = {}): PopupSnapshot {
    return {
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
        ...overrides,
    };
}

describe("popup state helpers", () => {
    it("treats a missing content unlock selector as a partial wall fix", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                temporaryWallFix: {
                    overlaySelector: ".paywall",
                    contentUnlockSelector: "",
                },
            }),
        );

        expect(policy.hasTemporaryWallFix).toBe(true);
        expect(policy.hasPartialTemporaryWallFix).toBe(true);
        expect(getSitePolicySummary(policy)).toContain("temporary partial wall-fix");
        expect(getBestNextMove(policy)).toMatchObject({
            action: "open-inspector-wall",
            actionLabel: "Open Inspector",
        });
        expect(getWallFixLabel(policy)).toContain("experimental partial wall fix");
    });

    it("nudges toward Inspector when hidden rules already exist", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                hiddenRules: [{ value: ".annoyance", enabled: true }],
            }),
        );

        expect(policy.hiddenRuleCount).toBe(1);
        expect(getBestNextMove(policy)).toMatchObject({
            action: "open-inspector",
            actionLabel: "Open Inspector",
        });
    });

    it("describes paused-site state ahead of other site modes", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                settings: {
                    isProtectionEnabled: true,
                    disabledSites: ["example.com"],
                    isolationModeSites: [{ value: "example.com", enabled: true }],
                    forgetfulSites: [],
                    customHidingRules: {},
                    persistentWallFixes: {},
                    isFocusModeEnabled: false,
                    focusModeUntil: 0,
                    isBreachWarningEnabled: true,
                },
            }),
        );

        expect(policy.isSiteProtectionEnabled).toBe(false);
        expect(getSitePolicySummary(policy)).toBe(
            "This site is paused and bypassing normal blocking.",
        );
    });

    it("matches paused-site state across www and apex hostnames", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                hostname: "www.example.com",
                settings: {
                    isProtectionEnabled: true,
                    disabledSites: ["example.com"],
                    isolationModeSites: [],
                    forgetfulSites: [],
                    customHidingRules: {},
                    persistentWallFixes: {},
                    isFocusModeEnabled: false,
                    focusModeUntil: 0,
                    isBreachWarningEnabled: true,
                },
            }),
        );

        expect(policy.isSiteProtectionEnabled).toBe(false);
    });

    it("uses the hero toggle for site protection on normal pages", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                settings: {
                    isProtectionEnabled: true,
                    disabledSites: ["example.com"],
                    isolationModeSites: [],
                    forgetfulSites: [],
                    customHidingRules: {},
                    persistentWallFixes: {},
                    isFocusModeEnabled: false,
                    focusModeUntil: 0,
                    isBreachWarningEnabled: true,
                },
            }),
        );

        expect(getHeroToggleLabel(policy)).toBe("Site Protection");
        expect(getHeroToggleChecked(policy)).toBe(false);
    });

    it("uses the hero toggle for global protection on extension pages", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                isExtensionPage: true,
                settings: {
                    isProtectionEnabled: false,
                    disabledSites: [],
                    isolationModeSites: [],
                    forgetfulSites: [],
                    customHidingRules: {},
                    persistentWallFixes: {},
                    isFocusModeEnabled: false,
                    focusModeUntil: 0,
                    isBreachWarningEnabled: true,
                },
            }),
        );

        expect(getHeroToggleLabel(policy)).toBe("Protection");
        expect(getHeroToggleChecked(policy)).toBe(false);
    });

    it("formats active focus sessions with the until label", () => {
        const future = Date.now() + 10 * 60 * 1000;
        const policy = buildSitePolicyState(
            createSnapshot({
                settings: {
                    isProtectionEnabled: true,
                    disabledSites: [],
                    isolationModeSites: [],
                    forgetfulSites: [],
                    customHidingRules: {},
                    persistentWallFixes: {},
                    isFocusModeEnabled: true,
                    focusModeUntil: future,
                    isBreachWarningEnabled: true,
                },
            }),
        );

        expect(policy.focusModeActive).toBe(true);
        expect(policy.focusModeUntilText).not.toBe("");
        expect(getFocusModeLabel(policy)).toContain("Focus Mode session active");
        expect(getFocusModeLabel(policy)).toContain("until");
    });

    it("treats temporary wall fixes as something to inspect, not blindly save", () => {
        const policy = buildSitePolicyState(
            createSnapshot({
                temporaryWallFix: {
                    overlaySelector: ".paywall",
                    contentUnlockSelector: ".article-body",
                },
            }),
        );

        expect(getBestNextMove(policy)).toMatchObject({
            action: "open-inspector-wall",
            actionLabel: "Open Inspector",
        });
        expect(getWallFixLabel(policy)).toContain("temporary wall fix is active");
    });

    it("shows the latest notable activity first instead of the oldest matching rows", () => {
        const notable = getRecentNotableActivity([
            {
                id: 1,
                url: "https://a.example.com/script.js",
                status: "blocked",
                timestamp: 1000,
            },
            {
                id: 2,
                url: "https://b.example.com/clean.js",
                status: "modified",
                timestamp: 3000,
            },
            {
                id: 3,
                url: "https://c.example.com/allowed.js",
                status: "allowed",
                timestamp: 4000,
            },
            {
                id: 4,
                url: "https://d.example.com/frame.js",
                status: "blocked",
                timestamp: 2000,
            },
        ] as any, 2);

        expect(notable.map((entry) => entry.id)).toEqual([2, 4]);
    });

    it("selects the newest cosmetic cleanup activity for the Home tab signal", () => {
        const activity = getRecentCosmeticCleanupActivity([
            {
                tool: "Cosmetic Cleanup",
                title: "Ad Shells Cleaned",
                message: "Collapsed 1 leftover ad shell after blocking.",
                tone: "success",
                timestamp: 1000,
                domain: "example.com",
            },
            {
                tool: "Fix Cookies",
                title: "Cookie Action Applied",
                message: "Applied.",
                tone: "success",
                timestamp: 3000,
                domain: "example.com",
            },
            {
                tool: "Cosmetic Cleanup",
                title: "Ad Shells Cleaned",
                message: "Collapsed 3 leftover ad shells after blocking.",
                tone: "success",
                timestamp: 2000,
                domain: "example.com",
            },
        ]);

        expect(activity?.message).toBe("Collapsed 3 leftover ad shells after blocking.");
    });

    it("matches cosmetic cleanup summaries across www and apex hostnames", () => {
        const summary = getCosmeticCleanupSummary(createSnapshot({
            hostname: "www.example.com",
            storage: {
                toolActivityLog: [],
                temporaryWallFixes: {},
                cosmeticCleanupSummaryByHostname: {
                    "example.com": {
                        count: 2,
                        latestHint: "iframe googleads.g.doubleclick.net",
                        updatedAt: 2000,
                    },
                },
            },
        }));

        expect(summary).toMatchObject({
            count: 2,
            latestHint: "iframe googleads.g.doubleclick.net",
        });
    });
});
