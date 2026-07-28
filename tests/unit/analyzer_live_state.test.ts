import {
    getAnalyzerContextKey,
    getAnalyzerSupportDataChangeTransition,
    hasAnalyzerPageChanged,
    shouldApplyAnalyzerOutcome,
} from "../../src/ui/analyzer/live_state";
import type { AnalyzerScanContext } from "../../src/ui/analyzer/types";

function createContext(overrides: Partial<AnalyzerScanContext> = {}): AnalyzerScanContext {
    return {
        tabId: 7,
        pageTitle: "Article",
        pageUrl: "https://example.com/article",
        hostname: "example.com",
        activeModel: "gemini-2.5-flash",
        apiKeyPresent: true,
        ...overrides,
    };
}

describe("analyzer live state helpers", () => {
    it("tracks analyzer context by tab and page url", () => {
        expect(getAnalyzerContextKey(createContext())).toBe("7::https://example.com/article");
        expect(getAnalyzerContextKey(createContext({ tabId: null, pageUrl: null }))).toBe("none::none");
    });

    it("detects when the analyzer tab navigates to a different page", () => {
        expect(hasAnalyzerPageChanged(
            createContext(),
            createContext({ pageUrl: "https://example.com/next", pageTitle: "Next" }),
        )).toBe(true);

        expect(hasAnalyzerPageChanged(
            createContext(),
            createContext({ pageTitle: "Renamed tab title" }),
        )).toBe(false);
    });

    it("rejects stale scan outcomes when the page changed or a newer scan started", () => {
        expect(shouldApplyAnalyzerOutcome(2, 2, "7::https://example.com/article", "7::https://example.com/article")).toBe(true);
        expect(shouldApplyAnalyzerOutcome(1, 2, "7::https://example.com/article", "7::https://example.com/article")).toBe(false);
        expect(shouldApplyAnalyzerOutcome(2, 2, "7::https://example.com/article", "7::https://example.com/next")).toBe(false);
    });

    it("keeps completed analyzer reports visible when support data changes", () => {
        expect(getAnalyzerSupportDataChangeTransition("report")).toEqual({
            invalidateActiveScan: false,
            clearReport: false,
            clearNeedsActionOnly: false,
            nextState: "report",
            scanStatusMessage: "Rules changed. Current report was kept; rescan only when you want refreshed coverage.",
        });
    });

    it("invalidates active scans when support data changes mid-scan", () => {
        expect(getAnalyzerSupportDataChangeTransition("loading")).toEqual({
            invalidateActiveScan: true,
            clearReport: true,
            clearNeedsActionOnly: true,
            nextState: "idle",
            scanStatusMessage: "Rules changed during the scan. Run it again when ready to refresh coverage for this page.",
        });
    });
});
