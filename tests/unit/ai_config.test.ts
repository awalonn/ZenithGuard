import {
    DEFAULT_GEMINI_MODEL,
    GEMINI_MODEL_OPTIONS,
    normalizeGeminiModel,
    resolveGeminiModel,
} from "../../src/js/background/modules/ai/config";

describe("Gemini model configuration", () => {
    it("uses the latest stable Flash model by default", () => {
        expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.7-flash");
        expect(GEMINI_MODEL_OPTIONS[0]).toEqual({
            value: "gemini-3.7-flash",
            label: "Gemini 3.7 Flash (Recommended)",
        });
    });

    it("falls back from removed presets to the current default", () => {
        expect(normalizeGeminiModel("gemini-2.5-flash-lite-preview-09-2025"))
            .toBe("gemini-3.7-flash");
    });

    it("keeps an explicit custom model override", () => {
        expect(resolveGeminiModel("gemini-3.7-flash", "future-model-id"))
            .toBe("future-model-id");
    });
});
