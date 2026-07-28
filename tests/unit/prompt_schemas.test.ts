import { buildWallFixPrompt } from "../../src/js/background/modules/ai/prompt_schemas";

describe("AI prompt schemas", () => {
    it("builds the wall-fix prompt with page context when available", () => {
        const prompt = buildWallFixPrompt({
            pageUrl: "https://www.washingtonpost.com/world/2026/03/28/example/",
            hostname: "www.washingtonpost.com",
            pageTitle: "Example article",
            visibleText: "Already have an account? Sign in Two ways to read this article",
            blockerCandidates: ["#paywall-shell", ".signup-gate"],
            contentCandidates: ["#main-content", "article"],
        });

        expect(prompt).toContain("Page URL: https://www.washingtonpost.com/world/2026/03/28/example/");
        expect(prompt).toContain("Hostname: www.washingtonpost.com");
        expect(prompt).toContain("Page title: Example article");
        expect(prompt).toContain("Visible page text sample:");
        expect(prompt).toContain("login gate");
        expect(prompt).toContain("overlaySelectors");
        expect(prompt).toContain("contentUnlockSelectors");
        expect(prompt).toContain("Live blocker candidates from the DOM:");
        expect(prompt).toContain("#paywall-shell");
        expect(prompt).toContain("Live content candidates from the DOM:");
        expect(prompt).toContain("#main-content");
    });
});
