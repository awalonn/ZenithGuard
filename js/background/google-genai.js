// A modern, self-contained ES module for the Google GenAI SDK, safe for Manifest V3.

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Defines the types available for response schemas.
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
 */
export class GoogleGenAI {
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
     * @param {object} request - The request payload for the API.
     * @returns {Promise<object>} A promise that resolves to the API response.
     */
    async generateContent(request) {
        if (!request.model) {
            return { error: "Model name is required." };
        }

        const url = `${API_BASE_URL}/${request.model}:generateContent?key=${this.apiKey}`;
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
                    
                    // Retry on server errors
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
                if (error.name === 'AbortError') {
                    console.error("Gemini API request timed out.");
                    return { error: "API request timed out." };
                }
                if (error.message === 'QUOTA_EXCEEDED') {
                    console.warn("Gemini API quota exceeded.");
                    return { error: 'QUOTA_EXCEEDED' };
                }
                // If it's the last attempt, re-throw the error.
                if (attempt === MAX_RETRIES - 1) {
                    console.error("Error calling Gemini API after all retries:", error.message);
                    return { error: error.message };
                }
            }
        }
    }
}