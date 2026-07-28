import {
    getDnrStatus,
    getMatchedRuleInfo,
} from "../../src/js/background/modules/network_logger/dnr_pipeline";

describe("DNR pipeline metadata", () => {
    it.each([
        [100, "Heuristic Engine"],
        [6_999, "Heuristic Engine"],
        [7_000, "Focus Mode"],
        [7_999, "Focus Mode"],
        [20_000, "YouTube Ads"],
        [29_999, "YouTube Ads"],
        [30_000, "Isolation Mode"],
        [39_999, "Isolation Mode"],
        [40_000, "Network Blocklist"],
        [49_999, "Network Blocklist"],
        [50_000, "URL Cleaner"],
        [59_999, "URL Cleaner"],
        [60_000, "User Allowlist"],
        [79_999, "User Allowlist"],
        [80_000, "Default Blocklist"],
        [199_999, "Default Blocklist"],
        [200_000, "Malware Protection"],
    ])("classifies fallback rule id %i as %s", (ruleId, expectedSource) => {
        expect(getMatchedRuleInfo(ruleId).source).toBe(expectedSource);
    });

    it.each([
        [8_000],
        [9_999],
        [10_000],
        [19_999],
    ])("does not classify reserved gap rule id %i as another dynamic family", (ruleId) => {
        expect(getMatchedRuleInfo(ruleId).source).toBe("DNR Filter");
    });

    it.each([
        [40_000, "blocked"],
        [50_000, "modified"],
        [60_000, "allowed"],
        [80_000, "blocked"],
    ])("maps rule id %i to %s status", (ruleId, expectedStatus) => {
        expect(getDnrStatus(ruleId)).toBe(expectedStatus);
    });
});
