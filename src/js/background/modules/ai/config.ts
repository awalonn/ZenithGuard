export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

export const GEMINI_MODEL_OPTIONS = [
    { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash (Recommended)" },
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (Fast / Low Cost)" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview / Paid)" },
] as const;

export const GLOBAL_AI_RATE_LIMIT_MS = 8_000;
export const AI_ANALYZER_CAPTURE_QUALITY = 50;
export const AI_DEFAULT_CAPTURE_QUALITY = 20;
export const AI_WALL_FIX_CAPTURE_QUALITY = 14;
export const AI_NETWORK_LOG_LIMIT = 50;
export const AI_NETWORK_URL_PREVIEW_LENGTH = 200;
export const AI_DEFAULT_TEMPERATURE = 0.1;

export type GeminiModelOption = typeof GEMINI_MODEL_OPTIONS[number];

export function normalizeGeminiModel(modelId?: string | null): string {
    const trimmed = (modelId || "").trim();
    return GEMINI_MODEL_OPTIONS.some((option) => option.value === trimmed)
        ? trimmed
        : DEFAULT_GEMINI_MODEL;
}

export function resolveGeminiModel(
    selectedModel?: string | null,
    overrideModelId?: string | null,
): string {
    const override = (overrideModelId || "").trim();
    return override.length > 0 ? override : normalizeGeminiModel(selectedModel || DEFAULT_GEMINI_MODEL);
}
