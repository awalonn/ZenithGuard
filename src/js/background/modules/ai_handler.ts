// ai_handler.ts
// AI-powered features using Google Gemini API
import { GoogleGenAI, Type, GenerativeModel, SchemaType } from '../google-genai.js';

// Configuration
const MODEL_NAME = 'gemini-3-flash-preview';

// Throttling state
let lastAiRequestTime = 0;
const GLOBAL_RPM_LIMIT_MS = 15000; // 15 seconds between ANY AI requests (max 4 RPM)

// Screenshot quality settings
const SCREENSHOT_QUALITY_HIGH = 50;  // For detailed analysis
const SCREENSHOT_QUALITY_MEDIUM = 30; // For moderate detail
const SCREENSHOT_QUALITY_LOW = 20;    // For fast processing

// Network log limits
const MAX_NETWORK_LOG_ENTRIES = 50;
const MAX_URL_LENGTH = 200;

// AI Configuration
const AI_TEMPERATURE = 0.1;

let aiInstance: GoogleGenAI | null = null;

// --- Interfaces ---

interface NetworkLogEntry {
    url: string;
    type: string;
    status: string;
}

interface Threat {
    url: string;
    category?: string;
    reason?: string;
}

interface VisualAnnoyance {
    description: string;
    suggestedSelector: string;
}

interface HeuristicMatch {
    url: string;
    keyword: string;
}

interface DarkPattern {
    patternName: string;
    description: string;
}

interface AnalysisResult {
    result?: {
        networkThreats?: Threat[];
        visualAnnoyances?: VisualAnnoyance[];
        heuristicMatches?: HeuristicMatch[];
        darkPatterns?: DarkPattern[];
    };
    error?: string;
}

interface HidingResult {
    selector?: string;
    error?: string;
}

interface SelectorContext {
    tag?: string;
    text?: string;
    classes?: string;
    tabId: number;
}

interface PrivacyPolicySummary {
    summary: string;
    dataCollected: string[];
    sharedWith: string[];
}

interface SummaryResult extends Partial<PrivacyPolicySummary> {
    error?: string;
}

interface SelfHealResult {
    newSelector?: string;
    error?: string;
}

interface AdblockDefeatResult {
    selectors?: {
        overlaySelector: string;
        scrollSelector: string;
    };
    error?: string;
}

interface CookieConsentResult {
    result?: {
        selector: string | null;
        action: string | null;
    };
    error?: string;
}


// --- Classes ---

/**
 * Manages screenshot captures to comply with Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.
 * Chrome limits to ~2 calls per second. We'll enforce a safer margin.
 */
class CaptureLimiter {
    private queue: Array<() => Promise<void>> = [];
    private isProcessing = false;
    private lastCaptureTime = 0;
    // 600ms = ~1.6 calls/sec, safe buffer for the 2 calls/sec limit
    private MIN_INTERVAL = 600;

    async capture(windowId: number, options: any): Promise<string> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const now = Date.now();
                    const timeSinceLast = now - this.lastCaptureTime;
                    if (timeSinceLast < this.MIN_INTERVAL) {
                        await new Promise(r => setTimeout(r, this.MIN_INTERVAL - timeSinceLast));
                    }
                    this.lastCaptureTime = Date.now();
                    // NOTE: captureVisibleTab can fail if the window is closed during the wait
                    const result = await chrome.tabs.captureVisibleTab(windowId, options);
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) await task();
        }
        this.isProcessing = false;
    }
}

const captureLimiter = new CaptureLimiter();


// --- Functions ---

/**
 * Resets the cached AI client instance.
 */
export function resetAiClient(): void {
    aiInstance = null;
}

async function checkRateLimit() {
    const now = Date.now();
    const timeSinceLast = now - lastAiRequestTime;
    if (timeSinceLast < GLOBAL_RPM_LIMIT_MS) {
        const waitTime = GLOBAL_RPM_LIMIT_MS - timeSinceLast;
        console.log(`ZenithGuard: Global AI rate limit hit. Throttling for ${Math.round(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastAiRequestTime = Date.now();
}

/**
 * Gets or creates the Gemini AI client instance.
 */
async function getAiClient(): Promise<GoogleGenAI> {
    await checkRateLimit(); // Throttle all AI calls globally
    if (aiInstance) return aiInstance;

    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey') as { geminiApiKey?: string };
    if (!geminiApiKey) {
        throw new Error("Gemini API key is not set. Please set it in the extension settings.");
    }
    aiInstance = new GoogleGenAI({ apiKey: geminiApiKey });
    return aiInstance;
}

/**
 * Reliably focuses a tab and performs an action.
 */
async function performActionOnVisibleTab<T>(tabId: number, action: (tab: chrome.tabs.Tab) => Promise<T>, options: { requireFocus?: boolean } = { requireFocus: true }): Promise<T> {
    let tab: chrome.tabs.Tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (error) {
        throw new Error(`Target tab with ID ${tabId} not found. It may have been closed.`);
    }

    if (!tab.url) throw new Error("Tab has no URL.");

    // Check for restricted URLs
    if (tab.url.startsWith('chrome:') || tab.url.startsWith('edge:') || tab.url.startsWith('about:') || tab.url.startsWith('mozilla:') || tab.url.startsWith('view-source:')) {
        throw new Error(`Cannot capture restricted page: ${tab.url}`);
    }

    // Check for file access
    if (tab.url.startsWith('file:')) {
        const isAllowed = await chrome.extension.isAllowedFileSchemeAccess();
        if (!isAllowed) {
            throw new Error("File access not enabled. Please enable 'Allow access to file URLs' in extension settings.");
        }
    }

    if (options.requireFocus) {
        try {
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.update(tabId, { active: true });
        } catch (error) {
            if (String((error as Error).message).includes('Tabs cannot be edited right now')) {
                throw new Error("Action aborted: User is interacting with the tab strip.");
            }
            // If tab was closed during update
            if (String((error as Error).message).includes('No tab with id')) {
                throw new Error("The target tab was closed before the action could complete.");
            }
            throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
        // Re-check if tab is still there after wait
        await chrome.tabs.get(tabId);
    } catch (e) {
        throw new Error("The target tab was closed before the action could complete.");
    }

    return await action(tab);
}

function safeJsonParse(text: string): any {
    try {
        if (!text) return {};
        // Clean markdown code blocks if present
        const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn("ZenithGuard: Failed to parse AI JSON response.", e);
        return {};
    }
}

/**
 * Helper to handle common errors, specifically silencing 'Tab Closed' errors.
 */
function handleCommonErrors(error: unknown, context: string): { error: string } {
    const msg = (error as Error).message;
    // Quota error from Chrome API
    if (msg === 'QUOTA_EXCEEDED') {
        console.warn(`ZenithGuard ${context}: Quota exceeded.`);
        return { error: 'QUOTA_EXCEEDED' };
    }
    // Handled closed tab errors gracefully
    if (msg.includes("Target tab with ID") || msg.includes("target tab was closed") || msg.includes("No tab with id")) {
        console.warn(`ZenithGuard ${context}: Tab was closed, action aborted.`);
        // Return a specific error code or just a generic one. Using 'TAB_CLOSED' allows UI to ignore it.
        return { error: 'TAB_CLOSED' };
    }

    console.error(`ZenithGuard ${context} Error:`, msg);
    return { error: msg };
}


/**
 * Analyzes a webpage for privacy threats using AI.
 */
export async function analyzePage(tabId: number, pageUrl: string, networkLog: NetworkLogEntry[]): Promise<AnalysisResult> {
    try {
        const resultJson = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            if (!ai.models) throw new Error("AI models not initialized");

            const screenshotDataUrl = await captureLimiter.capture(activeTab.windowId, {
                format: 'jpeg',
                quality: SCREENSHOT_QUALITY_HIGH
            });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            const filteredLog = (networkLog || [])
                .filter(req => req.status === 'blocked' && (req.type === 'script' || req.type === 'xmlhttprequest'))
                .map(req => req.url.substring(0, MAX_URL_LENGTH))
                .slice(0, MAX_NETWORK_LOG_ENTRIES);

            const prompt = `Analyze the provided webpage screenshot and network log for privacy threats, visual annoyances, and manipulative "dark patterns".
            - Network log contains blocked third-party tracking scripts.
            - The user wants to block ads, trackers, popups, and other intrusive elements.
            - Identify distinct visual elements that are likely ads, banners, or annoyances. For each, provide a UNIQUE and ROBUST CSS selector.
            - Identify network requests that are clearly for tracking or advertising.
            - Identify network requests that match common heuristic patterns for tracking (e.g., contains '/track.js', 'analytics', '/beacon').
            - Identify manipulative UI "dark patterns" like Confirm-shaming (e.g., "No, I don't want to save money"), Roach Motel (easy to sign up, hard to cancel), Hidden Costs, or forced continuity.
            - Be concise. Focus on actionable items. Do not suggest blocking core site functionality.`;

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    networkThreats: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, category: { type: Type.STRING }, reason: { type: Type.STRING } } } },
                    visualAnnoyances: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { description: { type: Type.STRING }, suggestedSelector: { type: Type.STRING } } } },
                    heuristicMatches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { url: { type: Type.STRING }, keyword: { type: Type.STRING } } } },
                    darkPatterns: { type: Type.ARRAY, description: "Deceptive UI patterns designed to trick users.", items: { type: Type.OBJECT, properties: { patternName: { type: Type.STRING }, description: { type: Type.STRING } } } }
                }
            };

            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error("AI_TIMEOUT")), 40000)
            );

            const analysisPromise = ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }, { text: `Network Log:\n${filteredLog.join('\n')}` }] },
                config: { responseMimeType: 'application/json', responseSchema: responseSchema as unknown as SchemaType, temperature: AI_TEMPERATURE }
            });

            const response = await Promise.race([analysisPromise, timeoutPromise]);
            return safeJsonParse(response.text);
        });

        const { auditHistory = [] } = await chrome.storage.local.get('auditHistory') as { auditHistory: any[] };

        const threatCount = (resultJson.networkThreats?.length || 0) + (resultJson.visualAnnoyances?.length || 0) + (resultJson.heuristicMatches?.length || 0) + (resultJson.darkPatterns?.length || 0);
        const grade = threatCount === 0 ? 'A' : (threatCount <= 5 ? 'B' : (threatCount <= 10 ? 'C' : 'D'));

        let domain = 'unknown';
        try {
            domain = new URL(pageUrl).hostname;
        } catch (e) {
            console.warn('ZenithGuard: Invalid URL for audit history:', pageUrl);
        }

        auditHistory.unshift({ url: pageUrl, domain: domain, date: Date.now(), grade: grade, threatCount: threatCount });

        if (auditHistory.length > 50) auditHistory.pop();
        await chrome.storage.local.set({ auditHistory });

        await chrome.storage.local.set({ [`ai-scan-cache-${pageUrl}`]: { data: resultJson, timestamp: Date.now() } });

        return { result: resultJson };

    } catch (error) {
        return handleCommonErrors(error, "AI Analyzer");
    }
}


export async function handleHideElementWithAI(description: string, context: SelectorContext): Promise<HidingResult> {
    try {
        const resultData = await performActionOnVisibleTab(context.tabId, async (activeTab) => {
            const ai = await getAiClient();
            if (!ai.models) throw new Error("AI models not initialized");

            const screenshotDataUrl = await captureLimiter.capture(activeTab.windowId, {
                format: 'jpeg',
                quality: SCREENSHOT_QUALITY_LOW
            });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            let prompt = `Analyze the provided webpage screenshot. The user wants to hide an element they've described as: "${description}". Based on this description and the visual context of the screenshot, generate the most robust and specific CSS selector possible to uniquely identify and hide this element.`;
            if (context && context.tag) {
                prompt += ` The user initially clicked on a <${context.tag}> element`;
                if (context.text) prompt += ` containing text like "${context.text}".`;
                if (context.classes) prompt += ` with classes "${context.classes}".`;
            }

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, selector: { type: Type.STRING } } };

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema as unknown as SchemaType, temperature: AI_TEMPERATURE }
            });

            const resultJson = safeJsonParse(response.text);
            if (!resultJson.selector || resultJson.selector.trim() === '') {
                throw new Error("AI failed to generate a valid selector.");
            }
            return { selector: resultJson.selector.trim() };
        });
        return resultData;
    } catch (error) {
        return handleCommonErrors(error, "AI Hider");
    }
}


export async function handleSummarizePrivacyPolicy(policyUrl: string): Promise<SummaryResult> {
    try {
        const ai = await getAiClient();
        if (!ai.models) throw new Error("AI models not initialized");

        const response = await fetch(policyUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Could not fetch the policy page.");
        const html = await response.text();

        const systemInstruction = `You are a privacy expert. Analyze the text from this privacy policy and provide a brief, easy-to-understand summary. Extract key data points. Respond ONLY with the JSON object.
        - "summary": A single, concise sentence (max 25 words) summarizing their main data practice (e.g., "Collects usage data to personalize ads and shares it with partners.").
        - "dataCollected": An array of strings categorizing the data they collect (e.g., "Personal Info", "Location", "Usage Data", "Contact Info", "Financial Info").
        - "sharedWith": An array of strings describing who they share data with (e.g., "Advertisers", "Affiliates", "Law Enforcement", "Analytics Partners").`;

        const responseSchema = { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, dataCollected: { type: Type.ARRAY, items: { type: Type.STRING } }, sharedWith: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['summary', 'dataCollected', 'sharedWith'] };

        const aiResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [{ text: `Privacy Policy Text:\n\n${html}` }] },
            systemInstruction: { parts: [{ text: systemInstruction }] },
            config: { responseMimeType: 'application/json', responseSchema: responseSchema as unknown as SchemaType, temperature: 0.0 }
        });

        return safeJsonParse(aiResponse.text);

    } catch (error) {
        console.error("ZenithGuard: Failed to summarize privacy policy:", error);
        return { error: (error as Error).message };
    }
}

export async function handleSelfHealRule(brokenSelector: string, tabId: number, pageUrl: string): Promise<SelfHealResult> {
    try {
        const resultData = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            if (!ai.models) throw new Error("AI models not initialized");

            const screenshotDataUrl = await captureLimiter.capture(activeTab.windowId, {
                format: 'jpeg',
                quality: SCREENSHOT_QUALITY_LOW
            });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            const prompt = `On the webpage at ${pageUrl}, the following CSS selector was used to hide an unwanted element, but it no longer works: "${brokenSelector}". 
            Based on the screenshot, analyze the page and generate a NEW, robust CSS selector that targets the element this old selector was most likely trying to hide.
            The element is probably an ad, a banner, a newsletter signup, or a similar annoyance. Prioritize stable attributes.`;

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, newSelector: { type: Type.STRING } }, required: ["newSelector"] };

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema as unknown as SchemaType, temperature: AI_TEMPERATURE }
            });

            const resultJson = safeJsonParse(response.text);
            if (!resultJson.newSelector || resultJson.newSelector.trim() === '' || resultJson.newSelector === brokenSelector) {
                throw new Error("AI could not generate a valid new selector.");
            }
            return { newSelector: resultJson.newSelector.trim() };
        });
        return resultData;
    } catch (error) {
        return handleCommonErrors(error, "Self-Heal");
    }
}

export async function handleDefeatAdblockWall(tabId: number, onProgress?: (msg: string) => Promise<void>): Promise<AdblockDefeatResult> {
    try {
        const doProgress = async (message: string) => {
            if (onProgress) await onProgress(message);
        };

        const selectors = await performActionOnVisibleTab(tabId, async (activeTab) => {
            await doProgress('Capturing page state...');

            const ai = await getAiClient();
            if (!ai.models) throw new Error("AI models not initialized");

            const screenshotDataUrl = await captureLimiter.capture(activeTab.windowId, {
                format: 'jpeg',
                quality: 30
            });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            const prompt = `You are a web developer expert at removing anti-adblock walls and intrusive banners. Analyze the provided webpage screenshot. 
            Identify the blocking elements. Use a rigorous 3-step process:
            1. find the MODAL (the popup box with text).
            2. find the BACKDROP/OVERLAY (the dark/blurred layer covering the whole screen).
            3. find the ROOT CONTAINER (if they share one).

            If they are siblings, provide BOTH selectors separated by a comma.
            
            CRITICAL INSTRUCTIONS:
            - You MUST return a selector that hits the BACKDROP. 
            - Look for full-screen fixed elements with high z-index (e.g., .modal-backdrop, .overlay, #shadow-root).
            - Prefer BROAD wildcard selectors for stability.
            
            Your goal is to provide:
            - 'overlaySelector': A comma-separated string containing selectors for BOTH the modal and the background overlay.
               Example: ".fc-dialog-container, .fc-ab-root, .MuiBackdrop-root"
            - 'scrollSelector': The element that needs scroll restoration (usually 'body' or 'html').`;

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, overlaySelector: { type: Type.STRING }, scrollSelector: { type: Type.STRING } }, required: ["overlaySelector"] };

            await doProgress('Consulting with Gemini AI...');
            console.log(`ZenithGuard: Sending prompt to AI for tab ${tabId}...`);

            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error("AI_TIMEOUT")), 40000)
            );

            const aiPromise = ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema as unknown as SchemaType, temperature: AI_TEMPERATURE }
            });

            const response = await Promise.race([aiPromise, timeoutPromise]);
            console.log(`ZenithGuard: AI response received for tab ${tabId}.`);

            const resultJson = safeJsonParse(response.text);
            console.log(`ZenithGuard: AI result for tab ${tabId}:`, resultJson);

            if (!resultJson.overlaySelector || resultJson.overlaySelector.trim() === '') {
                throw new Error("AI could not identify a blocking overlay.");
            }
            return { overlaySelector: resultJson.overlaySelector.trim(), scrollSelector: resultJson.scrollSelector?.trim() || 'body, html' };
        });
        return { selectors };
    } catch (error) {
        return handleCommonErrors(error, "Adblock Wall Defeat");
    }
}

export async function handleCookieConsent(tabId: number): Promise<CookieConsentResult> {
    try {
        // Safe Check: Don't steal focus. Only run if tab is active.
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active) {
            // Silently ignore if tab is not active to avoid annoyance and errors
            // console.log("ZenithGuard: Tab is not active, skipping Cookie Consent AI check.");
            return { result: { selector: null, action: null } };
        }

        const resultData = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            if (!ai.models) throw new Error("AI models not initialized");

            const screenshotDataUrl = await captureLimiter.capture(activeTab.windowId, {
                format: 'jpeg',
                quality: SCREENSHOT_QUALITY_LOW
            });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            const prompt = `Analyze the provided webpage screenshot for a cookie consent banner. Your goal is to find the single button that is best for user privacy. 
            1. Prioritize buttons with text like 'Reject All', 'Deny', 'Decline', 'Necessary Cookies Only', 'Save Preferences' (if options can be deselected), or 'Manage Settings'.
            2. If no rejection option is visible, as a LAST RESORT, find the button to accept and dismiss the banner, like 'Accept All', 'OK', 'Allow', or 'Got it'.
            3. If no cookie banner or relevant button is visible in the screenshot, you MUST return null for the 'selector' and 'action' properties.
            Return a single, robust CSS selector for the identified button and classify your action.
            IMPORTANT: The returned selector must be a standard, valid CSS selector usable by 'document.querySelector()'. DO NOT use non-standard pseudo-classes like ':has-text()' or ':contains()'.`;

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, selector: { type: Type.STRING }, action: { type: Type.STRING } } };

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema as unknown as SchemaType, temperature: AI_TEMPERATURE }
            });

            const resultJson = safeJsonParse(response.text);

            if (!resultJson || !resultJson.selector || resultJson.selector.trim() === '') {
                return { result: { selector: null, action: null } };
            }

            return { result: { selector: resultJson.selector.trim(), action: resultJson.action } };
        }, { requireFocus: false }); // New option to avoid forcing focus if we already checked it

        return resultData;

    } catch (error) {
        const err = error as Error;
        if (err.message && err.message.includes("could not identify a consent button")) {
            return { result: { selector: null, action: null } };
        }
        return handleCommonErrors(error, "Cookie Consent");
    }
}