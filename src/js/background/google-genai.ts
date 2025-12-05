// A modern, self-contained ES module for the Google GenAI SDK, safe for Manifest V3.
// REFACTORED:
// 1. Updated to the correct model name ('gemini-2.5-flash-preview-09-2025').
// 2. Changed error handling to THROW errors instead of returning error objects.
//    This is a more standard JavaScript pattern and simplifies the calling code.

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Defines the types available for response schemas.
 * @enum {string}
 */
export var Type;
(function (Type) {
    Type["TYPE_UNSPECIFIED"] = "TYPE_UNSPECIFIED";
    Type["STRING"] = "STRING";
    Type["NUMBER"] = "NUMBER";
    Type["INTEGER"] = "INTEGER";
    Type["BOOLEAN"] = "BOOLEAN";
    Type["ARRAY"] = "ARRAY";
    Type["OBJECT"] = "OBJECT";
    Type["NULL"] = "NULL";
})(Type || (Type = {}));

/**
 * A modern client for the Google AI Gemini API, designed for Manifest V3 extensions.
 * 
 * Features:
 * - Automatic retry logic with exponential backoff
 * - Quota error detection and handling
 * - Model name mapping for preview versions
 * - Throws errors instead of returning error objects (standard pattern)
 * 
 * @class GoogleGenAI
 * @example
 * const ai = new GoogleGenAI({ apiKey: 'your-api-key' });
 * const response = await ai.models.generateContent({
 *   model: 'gemini-2.5-flash',
 *   contents: { parts: [{ text: 'Hello!' }] }
 * });
 */
export class GoogleGenAI {
    /**
     * Creates a new GoogleGenAI client instance.
     * @param {Object} config - Configuration object
     * @param {string} config.apiKey - Google AI API key from Google AI Studio
     * @throws {Error} If apiKey is not provided
     */
    constructor(config) {
        if (!config || !config.apiKey) {
            throw new Error("API key is required for GoogleGenAI client.");
        }
        this.apiKey = config.apiKey;
        this.models = {
            generateContent: this.generateContent.bind(this)
        };
    }

    /**
     * Makes a request to the Gemini API's generateContent endpoint with built-in retry logic.
     * 
     * @param {Object} request - The request payload for the API
     * @param {string} request.model - Model name (e.g., 'gemini-2.5-flash')
     * @param {Object|Array} request.contents - Content to send to the model
     * @param {Array} request.contents.parts - Array of content parts (text, images, etc.)
     * @param {Object} [request.config] - Optional generation configuration
     * @param {number} [request.config.temperature] - Temperature for randomness (0.0-1.0)
     * @param {string} [request.config.responseMimeType] - Output format (e.g., 'application/json')
     * @param {Object} [request.config.responseSchema] - JSON schema for structured output
     * @param {Object} [request.systemInstruction] - System-level instructions
     * 
     * @returns {Promise<{text: string}>} The API response with extracted text
     * 
     * @throws {Error} 'QUOTA_EXCEEDED' - When API quota is exceeded
     * @throws {Error} Network errors, authentication errors, or invalid responses
     * 
     * @example
     * const response = await ai.models.generateContent({
     *   model: 'gemini-2.5-flash',
     *   contents: {
     *     parts: [
     *       { text: 'Describe this image' },
     *       { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
     *     ]
     *   },
     *   config: {
     *     temperature: 0.1,
     *     responseMimeType: 'application/json',
     *     responseSchema: { type: Type.OBJECT, properties: {...} }
     *   }
     * });
     */
    async generateContent(request) {
        if (!request.model) {
            throw new Error("Model name is required.");
        }

        // REFACTOR: Use the correct, specified model name
        const modelName = request.model === 'gemini-2.5-flash'
            ? 'gemini-2.5-flash-preview-09-2025'
            : request.model;

        const url = `${API_BASE_URL}/${modelName}:generateContent?key=${this.apiKey}`;

        const payload = {
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
                        // REFACTOR: Throw a specific error
                        throw new Error('QUOTA_EXCEEDED');
                    }

                    // Retry on server errors
                    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
                        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // REFACTOR: Throw the error
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                return { text };

            } catch (error) {
                if (error.name === 'AbortError') {
                    console.error("Gemini API request timed out.");
                    // REFACTOR: Re-throw
                    throw new Error("API request timed out.");
                }
                if (error.message === 'QUOTA_EXCEEDED') {
                    console.warn("Gemini API quota exceeded.");
                    // REFACTOR: Re-throw
                    throw error;
                }
                // If it's the last attempt, re-throw the error.
                if (attempt === MAX_RETRIES - 1) {
                    console.error("Error calling Gemini API after all retries:", error.message);
                    // REFACTOR: Re-throw
                    throw error;
                }
            }
        }

        // This line should not be reachable, but as a fallback:
        throw new Error("Gemini API request failed after all retries.");
    }
}