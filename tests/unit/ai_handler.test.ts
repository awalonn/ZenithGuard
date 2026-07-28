import { normalizeWallFixSelectors } from "../../src/js/background/modules/ai_handler";

describe("AI handler wall-fix selector normalization", () => {
    it("keeps multiple Gemini candidates instead of collapsing to one selector", () => {
        const normalized = normalizeWallFixSelectors({
            overlaySelector: "#paywall-qa",
            overlaySelectors: ["#paywall-qa", ".paywall-modal", ".signup-gate"],
            contentUnlockSelector: "#main-content",
            contentUnlockSelectors: ["#main-content", "[data-qa='article-body']"],
            reasoning: "Primary candidate may be brittle.",
        });

        expect(normalized.overlaySelectors).toEqual([
            "#paywall-qa",
            ".paywall-modal",
            ".signup-gate",
        ]);
        expect(normalized.overlaySelector).toBe("#paywall-qa, .paywall-modal, .signup-gate");
        expect(normalized.contentUnlockSelectors).toEqual([
            "#main-content",
            "[data-qa='article-body']",
        ]);
        expect(normalized.contentUnlockSelector).toBe("#main-content, [data-qa='article-body']");
    });

    it("filters unsafe blocker candidates while preserving valid ones", () => {
        const normalized = normalizeWallFixSelectors({
            overlaySelector: "body",
            overlaySelectors: ["body", "main", "#paywall-shell", ".paywall-card"],
            contentUnlockSelector: "#main-content",
        });

        expect(normalized.overlaySelectors).toEqual([
            "#paywall-shell",
            ".paywall-card",
        ]);
        expect(normalized.overlaySelector).toBe("#paywall-shell, .paywall-card");
    });

    it("merges live DOM fallback candidates into the final selector set", () => {
        const normalized = normalizeWallFixSelectors({
            overlaySelector: "#paywall-qa",
            contentUnlockSelector: "#main-content",
        }, {
            blockerCandidates: [".signup-gate", "[data-qa=\"paywall\"]"],
            contentCandidates: ["article", "[data-qa=\"article-body\"]"],
        });

        expect(normalized.overlaySelectors).toEqual([
            "#paywall-qa",
            ".signup-gate",
            "[data-qa=\"paywall\"]",
        ]);
        expect(normalized.contentUnlockSelectors).toEqual([
            "#main-content",
            "article",
            "[data-qa=\"article-body\"]",
        ]);
    });

    it("drops garbage overlay candidates like bare tags, nav, and extension UI selectors", () => {
        const normalized = normalizeWallFixSelectors({
            overlaySelector: "#paywall-qa",
            overlaySelectors: ["div", "#zg-toast-container", "#sf-primary-nav", ".real-paywall"],
            contentUnlockSelector: "#main-content",
        });

        expect(normalized.overlaySelectors).toEqual([
            ".real-paywall",
            "#paywall-qa",
        ]);
    });
});
