export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const GEMINI_MODEL_OPTIONS = [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended)" },
    { value: "gemini-2.5-flash-lite-preview-09-2025", label: "Gemini 2.5 Flash Lite Preview" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
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
