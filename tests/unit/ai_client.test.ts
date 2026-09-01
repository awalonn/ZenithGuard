import {
    normalizeGeminiException,
    supportsLegacyGeminiSampling,
} from "../../src/js/background/modules/ai/client";

describe("Gemini client timeout normalization", () => {
    it("normalizes signal timed out into AI_TIMEOUT", () => {
        expect(normalizeGeminiException(new Error("signal timed out"))).toBe("AI_TIMEOUT");
    });

    it("normalizes AbortError-like failures into AI_TIMEOUT", () => {
        expect(normalizeGeminiException(new Error("AbortError: The operation was aborted."))).toBe("AI_TIMEOUT");
    });

    it("leaves unrelated errors unchanged", () => {
        expect(normalizeGeminiException(new Error("Quota exceeded by service"))).toBe("Quota exceeded by service");
    });
});

describe("Gemini sampling compatibility", () => {
    it("keeps legacy sampling parameters for Gemini 2.x models", () => {
        expect(supportsLegacyGeminiSampling("gemini-2.5-flash")).toBe(true);
    });

    it("omits deprecated sampling parameters for current and aliased models", () => {
        expect(supportsLegacyGeminiSampling("gemini-3.7-flash")).toBe(false);
        expect(supportsLegacyGeminiSampling("gemini-flash-latest")).toBe(false);
    });
});
