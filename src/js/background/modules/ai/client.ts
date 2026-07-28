import { getLocal, getSync } from "../../../shared/storage_api";
import { DEFAULT_GEMINI_MODEL, GLOBAL_AI_RATE_LIMIT_MS, resolveGeminiModel } from "./config";

export type GeminiGenerateContentConfig = {
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    systemInstruction?: { parts: Array<{ text: string }> };
};

export type GeminiGenerateContentRequest = {
    model: string;
    contents: unknown[];
    config?: GeminiGenerateContentConfig;
};

export type GeminiGenerateContentResponse = {
    text: string;
};

export type GeminiClient = {
    models: {
        generateContent: (request: GeminiGenerateContentRequest) => Promise<GeminiGenerateContentResponse>;
    };
};

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const GEMINI_CLIENT_HEADER = "zenithguard-extension/3.2.2";

let lastAiRequestAt = 0;
let cachedClient: GeminiClient | null = null;

function safeParseJson(value: string): unknown {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

async function wait(durationMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function enforceGlobalAiRateLimit(minIntervalMs = GLOBAL_AI_RATE_LIMIT_MS): Promise<void> {
    const elapsed = Date.now() - lastAiRequestAt;
    if (elapsed < minIntervalMs) {
        const waitMs = minIntervalMs - elapsed;
        console.info(`ZenithGuard: Global AI rate limit hit. Throttling for ${Math.round(waitMs / 1000)}s...`);
        await wait(waitMs);
    }

    lastAiRequestAt = Date.now();
}

export function resetGeminiClient(): void {
    cachedClient = null;
}

export async function getActiveGeminiModel(): Promise<string> {
    const settings = await getSync<{ geminiModel?: string; geminiModelOverride?: string }>([
        "geminiModel",
        "geminiModelOverride",
    ]);

    return resolveGeminiModel(settings.geminiModel || DEFAULT_GEMINI_MODEL, settings.geminiModelOverride);
}

export function buildGeminiGenerateContentUrl(model: string): string {
    return `${GEMINI_API_BASE_URL}${encodeURIComponent(model)}:generateContent`;
}

export function extractGeminiText(responsePayload: Record<string, unknown>): string {
    const candidates = Array.isArray(responsePayload.candidates)
        ? responsePayload.candidates as Array<Record<string, unknown>>
        : [];
    const parts = Array.isArray(candidates[0]?.content && (candidates[0].content as Record<string, unknown>).parts)
        ? ((candidates[0].content as Record<string, unknown>).parts as Array<Record<string, unknown>>)
        : [];

    for (const part of parts) {
        if (typeof part.text === "string" && part.text.trim().length > 0) {
            return part.text;
        }
    }

    const promptFeedback = isObjectLike(responsePayload.promptFeedback) ? responsePayload.promptFeedback : null;
    if (typeof promptFeedback?.blockReason === "string" && promptFeedback.blockReason.trim().length > 0) {
        throw new Error(`AI response blocked: ${promptFeedback.blockReason}`);
    }

    throw new Error("AI response did not include text output.");
}

export function normalizeGeminiError(
    statusCode: number,
    payload: Record<string, unknown>,
    statusText: string,
): string {
    const errorPayload = isObjectLike(payload.error) ? payload.error : {};
    const message = typeof errorPayload.message === "string" ? errorPayload.message : null;
    const status = typeof errorPayload.status === "string" ? errorPayload.status : null;

    if (statusCode === 429 || status === "RESOURCE_EXHAUSTED") {
        return "QUOTA_EXCEEDED";
    }

    if (message && message.trim().length > 0) {
        return message;
    }

    return `Gemini API request failed (${statusCode} ${statusText})`;
}

export function normalizeGeminiException(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.trim().toLowerCase();

    if (
        normalized === "ai_timeout"
        || normalized.includes("signal timed out")
        || normalized.includes("timed out")
        || normalized.includes("aborterror")
        || normalized.includes("the operation was aborted")
    ) {
        return "AI_TIMEOUT";
    }

    return message;
}

export function createGeminiClient(apiKey: string): GeminiClient {
    return {
        models: {
            async generateContent(request: GeminiGenerateContentRequest): Promise<GeminiGenerateContentResponse> {
                const generationConfig: Record<string, unknown> = {};
                if (typeof request.config?.temperature === "number") {
                    generationConfig.temperature = request.config.temperature;
                }
                if (typeof request.config?.responseMimeType === "string") {
                    generationConfig.responseMimeType = request.config.responseMimeType;
                }
                if (request.config?.responseSchema !== undefined) {
                    generationConfig.responseSchema = request.config.responseSchema;
                }

                const body: Record<string, unknown> = {
                    contents: request.contents,
                };

                if (request.config?.systemInstruction) {
                    body.systemInstruction = request.config.systemInstruction;
                }
                if (Object.keys(generationConfig).length > 0) {
                    body.generationConfig = generationConfig;
                }

                let response: Response;
                try {
                    response = await fetch(buildGeminiGenerateContentUrl(request.model), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": apiKey,
                            "x-goog-api-client": GEMINI_CLIENT_HEADER,
                        },
                        body: JSON.stringify(body),
                        signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
                        referrerPolicy: "no-referrer",
                    });
                } catch (error) {
                    throw new Error(normalizeGeminiException(error));
                }

                const rawText = await response.text();
                const parsed = safeParseJson(rawText);

                if (!response.ok) {
                    const payload = isObjectLike(parsed) ? parsed : {};
                    throw new Error(normalizeGeminiError(response.status, payload, response.statusText));
                }

                const payload = isObjectLike(parsed) ? parsed : {};
                return { text: extractGeminiText(payload) };
            },
        },
    };
}

export async function getGeminiClient(): Promise<GeminiClient> {
    await enforceGlobalAiRateLimit();

    if (cachedClient) {
        return cachedClient;
    }

    const { geminiApiKey } = await getLocal<{ geminiApiKey?: string }>("geminiApiKey");
    if (!geminiApiKey) {
        throw new Error("Gemini API key is not set. Please set it in the extension settings.");
    }

    cachedClient = createGeminiClient(geminiApiKey);
    return cachedClient;
}
