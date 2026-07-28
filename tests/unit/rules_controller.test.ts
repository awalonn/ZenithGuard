import { jest } from "@jest/globals";
import {
    addDomainRule,
    addFocusDomain,
    addPausedDomain,
    addNetworkRule,
    deleteHidingDomain,
    deleteDomainRule,
    deleteNetworkRule,
    deleteSingleHidingRule,
    getEffectiveFocusDomains,
    getNetworkRuleMeta,
    getNetworkRuleOriginSource,
    matchesNetworkRuleOriginFilter,
    removeFocusDomain,
    removePausedDomain,
    toggleExpandedDomain,
    toggleWallFix,
    deleteWallFix,
} from "../../src/ui/settings/rules_controller";

describe("settings rules controller helpers", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("treats an empty focus custom list as the built-in defaults", () => {
        const result = getEffectiveFocusDomains([]);

        expect(result.usesDefaults).toBe(true);
        expect(result.domains).toContain("reddit.com");
        expect(result.domains).toContain("youtube.com");
    });

    it("extends focus defaults when adding the first custom domain", () => {
        const result = addFocusDomain([], "news.ycombinator.com");

        expect(result.nextValue).toBe("");
        expect(result.nextList).toContain("reddit.com");
        expect(result.nextList).toContain("news.ycombinator.com");
    });

    it("removes a built-in focus domain when operating from the default baseline", () => {
        const nextList = removeFocusDomain([], "reddit.com");

        expect(nextList).not.toContain("reddit.com");
        expect(nextList).toContain("youtube.com");
    });

    it("treats paused-site entries as matching across www and non-www hostnames", () => {
        expect(() => addPausedDomain(["washingtonpost.com"], "www.washingtonpost.com"))
            .toThrow("Protection is already paused for this domain.");

        expect(removePausedDomain(["washingtonpost.com"], "www.washingtonpost.com")).toEqual([]);
    });

    it("treats isolation and forgetful domain entries as matching across www and non-www hostnames", () => {
        expect(() => addDomainRule(
            [{ value: "washingtonpost.com", enabled: true }],
            "www.washingtonpost.com",
            "Isolation Mode is already enabled for this domain.",
        )).toThrow("Isolation Mode is already enabled for this domain.");

        expect(addDomainRule(
            [{ value: "washingtonpost.com", enabled: false }],
            "www.washingtonpost.com",
            "Isolation Mode is already enabled for this domain.",
        )).toEqual({
            nextList: [{ value: "washingtonpost.com", enabled: true }],
            nextValue: "",
        });

        expect(deleteDomainRule(
            [{ value: "washingtonpost.com", enabled: true }],
            "www.washingtonpost.com",
        )).toEqual([]);
    });

    it("treats focus domains as matching across www and non-www hostnames", () => {
        expect(() => addFocusDomain(["washingtonpost.com"], "www.washingtonpost.com"))
            .toThrow("Domain already exists.");

        expect(removeFocusDomain(["washingtonpost.com"], "www.washingtonpost.com")).toEqual([]);
    });

    it("adds settings-origin metadata for new custom network rules", () => {
        const now = Date.now();
        jest.spyOn(Date, "now").mockReturnValue(now);

        const result = addNetworkRule([], {}, "example.com");

        expect(result.nextValue).toBe("");
        expect(result.nextList).toEqual([{ value: "example.com", enabled: true }]);
        expect(result.nextMeta["example.com"]).toEqual({
            source: "settings",
            addedAt: now,
        });
    });

    it("preserves existing source metadata when re-enabling a disabled custom network rule", () => {
        const result = addNetworkRule(
            [{ value: "example.com", enabled: false }],
            {
                "example.com": {
                    source: "analyzer",
                    addedAt: 123,
                },
            },
            "example.com",
        );

        expect(result.nextList).toEqual([{ value: "example.com", enabled: true }]);
        expect(result.nextMeta["example.com"]).toEqual({
            source: "analyzer",
            addedAt: 123,
        });
    });

    it("removes custom network rules and metadata across www and non-www hostnames", () => {
        const result = deleteNetworkRule(
            [{ value: "washingtonpost.com", enabled: true }],
            {
                "washingtonpost.com": {
                    source: "settings",
                    addedAt: 123,
                },
            },
            "www.washingtonpost.com",
        );

        expect(result.nextList).toEqual([]);
        expect(result.nextMeta).toEqual({});
    });

    it("resolves and filters custom network rule metadata across hostname variants", () => {
        const meta = {
            "example.com": {
                source: "logger",
                addedAt: 123,
            },
            "ads.example.net": {
                source: "analyzer",
                addedAt: 456,
            },
        };

        expect(getNetworkRuleMeta("www.example.com", meta)).toEqual({
            source: "logger",
            addedAt: 123,
        });
        expect(getNetworkRuleOriginSource("www.example.com", meta)).toBe("logger");
        expect(getNetworkRuleOriginSource("unknown.example", meta)).toBe("custom");
        expect(matchesNetworkRuleOriginFilter("www.example.com", meta, "logger")).toBe(true);
        expect(matchesNetworkRuleOriginFilter("www.example.com", meta, "analyzer")).toBe(false);
        expect(matchesNetworkRuleOriginFilter("ads.example.net", meta, "analyzer")).toBe(true);
        expect(matchesNetworkRuleOriginFilter("unknown.example", meta, "custom")).toBe(true);
        expect(matchesNetworkRuleOriginFilter("unknown.example", meta, "all")).toBe(true);
    });

    it("toggles and deletes wall fixes across www and non-www hostnames", () => {
        expect(toggleWallFix(
            {
                "washingtonpost.com": {
                    overlaySelector: ".paywall",
                    enabled: true,
                },
            },
            "www.washingtonpost.com",
            false,
        )).toEqual({
            "washingtonpost.com": {
                overlaySelector: ".paywall",
                enabled: false,
            },
        });

        expect(deleteWallFix(
            {
                "washingtonpost.com": {
                    overlaySelector: ".paywall",
                    enabled: true,
                },
            },
            "www.washingtonpost.com",
        )).toEqual({});
    });

    it("toggles expanded custom-hiding domains across www and non-www hostnames", () => {
        expect(toggleExpandedDomain(new Set(["washingtonpost.com"]), "www.washingtonpost.com")).toEqual(new Set());
    });

    it("deletes custom-hiding domains and single rules across www and non-www hostnames", () => {
        expect(deleteHidingDomain(
            {
                "washingtonpost.com": [
                    { value: ".paywall", enabled: true },
                ],
            },
            new Set(["washingtonpost.com"]),
            "www.washingtonpost.com",
        )).toEqual({
            customHidingRules: {},
            expandedHidingDomains: new Set(),
        });

        expect(deleteSingleHidingRule(
            {
                "washingtonpost.com": [
                    { value: ".paywall", enabled: true },
                    { value: ".drawer", enabled: true },
                ],
            },
            new Set(["washingtonpost.com"]),
            "www.washingtonpost.com",
            0,
        )).toEqual({
            customHidingRules: {
                "washingtonpost.com": [
                    { value: ".drawer", enabled: true },
                ],
            },
            expandedHidingDomains: new Set(["washingtonpost.com"]),
        });
    });
});
