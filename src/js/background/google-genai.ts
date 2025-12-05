// google-genai.ts
// A modern, self-contained ES module for the Google GenAI SDK, safe for Manifest V3.

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export enum Type {
    TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
    STRING = "STRING",
    NUMBER = "NUMBER",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    ARRAY = "ARRAY",
    OBJECT = "OBJECT",
    NULL = "NULL"
}

export interface SchemaProperty {
    type: Type;
    description?: string;
    properties?: Record<string, SchemaProperty>;
    items?: SchemaProperty;
    enum?: string[];
}

export interface SchemaType {
    type: Type;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
    description?: string;
    items?: SchemaProperty;
}

export interface GenerationConfig {
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: SchemaType;
}

export interface ContentPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface Content {
    parts: ContentPart[];
}

export interface GenerateContentRequest {
    model: string;
    contents: Content | Content[];
    config?: GenerationConfig;
    systemInstruction?: Content;
}

export interface GenerateContentResponse {
    text: string;
}

export interface GenAIConfig {
    apiKey: string;
}

export class GenerativeModel {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
        if (!request.model) {
            throw new Error("Model name is required.");
        }

        const modelName = request.model === 'gemini-2.5-flash'
            ? 'gemini-2.5-flash-preview-09-2025'
            : request.model;

        const url = `${API_BASE_URL}/${modelName}:generateContent?key=${this.apiKey}`;

        const payload: any = {
            contents: Array.isArray(request.contents) ? request.contents : [request.contents],
        };

        if (request.config) {
            payload.generationConfig = {
                temperature: request.config.temperature,
                responseMimeType: request.config.responseMimeType,
                responseSchema: request.config.responseSchema
            };
        }

        if (request.systemInstruction) {
            payload.systemInstruction = request.systemInstruction;
        }

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    let errorBody;
                    try {
                        errorBody = await response.json();
                    } catch (e) {
                        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
                    }

                    const errorMessage = errorBody?.error?.message || JSON.stringify(errorBody);
                    const isQuotaError = response.status === 429 || errorMessage.toLowerCase().includes('quota');

                    if (isQuotaError) {
                        throw new Error('QUOTA_EXCEEDED');
                    }

                    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
                        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error(errorMessage);
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                return { text };

            } catch (error) {
                const err = error as Error;
                if (err.name === 'AbortError') {
                    console.error("Gemini API request timed out.");
                    throw new Error("API request timed out.");
                }
                if (err.message === 'QUOTA_EXCEEDED') {
                    console.warn("Gemini API quota exceeded.");
                    throw err;
                }
                if (attempt === MAX_RETRIES - 1) {
                    console.error("Error calling Gemini API after all retries:", err.message);
                    throw err;
                }
            }
        }
        throw new Error("Gemini API request failed after all retries.");
    }
}

export class GoogleGenAI {
    public models: GenerativeModel;
    private apiKey: string;

    constructor(config: GenAIConfig) {
        if (!config || !config.apiKey) {
            throw new Error("API key is required for GoogleGenAI client.");
        }
        this.apiKey = config.apiKey;
        // Bind the inner class or just expose it.
        // For compatibility with previous usage 'ai.models.generateContent', we structure it this way.
        this.models = new GenerativeModel(this.apiKey);
    }
}