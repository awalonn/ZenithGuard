// ai_handler.js
// AI-powered features using Google Gemini API
// 
// This module provides 6 AI-powered features:
// 1. Page Analysis - Identifies privacy threats, dark patterns, and annoyances
// 2. Element Hiding - Generates CSS selectors from natural language descriptions
// 3. Privacy Policy Summarization - Extracts key data practices from policies
// 4. Self-Healing Rules - Automatically repairs broken CSS selectors
// 5. Adblock Wall Defeat - Removes anti-adblock overlays
// 6. Cookie Consent Automation - Automatically handles cookie banners

import { GoogleGenAI, Type } from '../google-genai.js';

// Configuration
const MODEL_NAME = 'gemini-2.5-flash';

// Screenshot quality settings
const SCREENSHOT_QUALITY_HIGH = 50;  // For detailed analysis
const SCREENSHOT_QUALITY_MEDIUM = 30; // For moderate detail
const SCREENSHOT_QUALITY_LOW = 20;    // For fast processing

// Network log limits
const MAX_NETWORK_LOG_ENTRIES = 50;
const MAX_URL_LENGTH = 200;

// AI Configuration
const AI_TEMPERATURE = 0.1; // Low temperature for consistent, deterministic output

let aiInstance = null;

/**
 * Resets the cached AI client instance.
 * Called when the user updates their API key in settings.
 */
export function resetAiClient() {
    aiInstance = null;
}

/**
 * Gets or creates the Gemini AI client instance.
 * @private
 * @returns {Promise<GoogleGenAI>} The AI client instance
 * @throws {Error} If API key is not configured
 */
async function getAiClient() {
    if (aiInstance) return aiInstance;

    const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
    if (!geminiApiKey) {
        throw new Error("Gemini API key is not set. Please set it in the extension settings.");
    }
    aiInstance = new GoogleGenAI({ apiKey: geminiApiKey });
    return aiInstance;
}

/**
 * Reliably focuses a tab, performs an action (like screenshotting), and returns the result.
 * This replaces the previous, more complex logic to prevent race conditions.
 * @private
 * @param {number} tabId - The ID of the tab to perform the action on
 * @param {Function} action - A function that takes the tab object and returns a Promise
 * @returns {Promise<any>} The result of the action
 * @throws {Error} If tab doesn't exist, is being interacted with, or is closed during action
 */
async function performActionOnVisibleTab(tabId, action) {
    let tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (error) {
        throw new Error(`Target tab with ID ${tabId} not found. It may have been closed.`);
    }

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

    try {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
    } catch (error) {
        if (String(error.message).includes('Tabs cannot be edited right now')) {
            throw new Error("Action aborted: User is interacting with the tab strip.");
        }
        throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay for stability

    try {
        await chrome.tabs.get(tabId);
    } catch (e) {
        throw new Error("The target tab was closed before the action could complete.");
    }

    return await action(tab);
}


/**
 * Analyzes a webpage for privacy threats, visual annoyances, and dark patterns using AI.
 * 
 * Features detected:
 * - Network tracking threats (blocked third-party scripts)
 * - Visual annoyances (ads, banners, popups)
 * - Heuristic pattern matches (common tracking URLs)
 * - Dark patterns (manipulative UI elements)
 * 
 * @param {number} tabId - The ID of the tab to analyze
 * @param {string} pageUrl - The URL of the page being analyzed
 * @param {Array<Object>} networkLog - Array of network requests with status and type
 * @returns {Promise<{result?: Object, error?: string}>} Analysis results with threats or error message
 * 
 * @property {Object} result - The analysis results
 * @property {Array<Object>} result.networkThreats - Identified network-level threats
 * @property {Array<Object>} result.visualAnnoyances - Visual elements to hide
 * @property {Array<Object>} result.heuristicMatches - Pattern-based threat detections
 * @property {Array<Object>} result.darkPatterns - Manipulative UI patterns
 */
export async function analyzePage(tabId, pageUrl, networkLog) {
    try {
        const resultJson = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();

            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
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

            // REFACTOR: The client now throws on error
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }, { text: `Network Log:\n${filteredLog.join('\n')}` }] },
                config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: AI_TEMPERATURE }
            });

            return JSON.parse(response.text);
        });

        const { auditHistory = [] } = await chrome.storage.local.get('auditHistory');
        const threatCount = (resultJson.networkThreats?.length || 0) + (resultJson.visualAnnoyances?.length || 0) + (resultJson.heuristicMatches?.length || 0) + (resultJson.darkPatterns?.length || 0);
        const grade = threatCount === 0 ? 'A' : (threatCount <= 5 ? 'B' : (threatCount <= 10 ? 'C' : 'D'));

        // Safely parse the domain from pageUrl
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
        if (error.message === 'QUOTA_EXCEEDED') {
            console.warn("ZenithGuard AI: Quota exceeded.");
            return { error: 'QUOTA_EXCEEDED' };
        }
        console.error("ZenithGuard AI Analyzer Error:", error.message);
        return { error: error.message };
    }
}


export async function handleHideElementWithAI(description, context) {
    try {
        const resultData = await performActionOnVisibleTab(context.tabId, async (activeTab) => {
            const ai = await getAiClient();
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
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
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: AI_TEMPERATURE }
            });

            const resultJson = JSON.parse(response.text);
            if (!resultJson.selector || resultJson.selector.trim() === '') {
                throw new Error("AI failed to generate a valid selector.");
            }
            return { selector: resultJson.selector.trim() };
        });
        return resultData;
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            console.warn("ZenithGuard AI: Quota exceeded.");
            return { error: 'QUOTA_EXCEEDED' };
        }
        console.error("ZenithGuard AI Hider Error:", error.message);
        return { error: error.message };
    }
}


export async function handleSummarizePrivacyPolicy(policyUrl) {
    try {
        const ai = await getAiClient();

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
            config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.0 }
        });

        return JSON.parse(aiResponse.text);

    } catch (error) {
        console.error("ZenithGuard: Failed to summarize privacy policy:", error);
        // REFACTOR: Return an error object for the caller to handle
        return { error: error.message };
    }
}

export async function handleSelfHealRule(brokenSelector, tabId, pageUrl) {
    try {
        const resultData = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
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
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: AI_TEMPERATURE }
            });

            const resultJson = JSON.parse(response.text);
            if (!resultJson.newSelector || resultJson.newSelector.trim() === '' || resultJson.newSelector === brokenSelector) {
                throw new Error("AI could not generate a valid new selector.");
            }
            return { newSelector: resultJson.newSelector.trim() };
        });
        return resultData;
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            console.warn("ZenithGuard AI: Quota exceeded.");
            return { error: 'QUOTA_EXCEEDED' };
        }
        console.error("ZenithGuard Self-Heal Error:", error.message);
        return { error: error.message };
    }
}

export async function handleDefeatAdblockWall(tabId, onProgress) {
    try {
        const doProgress = async (message) => {
            if (onProgress) await onProgress(message);
        };

        const selectors = await performActionOnVisibleTab(tabId, async (activeTab) => {
            await doProgress('Capturing page state...');

            const ai = await getAiClient();
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 30 });
            const base64Screenshot = screenshotDataUrl.split(',')[1];

            const prompt = `You are a web developer expert at removing anti-adblock walls. Analyze the provided webpage screenshot. Identify the primary overlay, modal, or banner that is blocking the user's view of the content. Also, check if the main page scrolling is disabled (e.g., via 'overflow: hidden' on the html or body). Your goal is to provide two CSS selectors to fix this.`;

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, overlaySelector: { type: Type.STRING }, scrollSelector: { type: Type.STRING } }, required: ["overlaySelector"] };

            await doProgress('Consulting with Gemini AI...');

            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: AI_TEMPERATURE }
            });

            const resultJson = JSON.parse(response.text);
            if (!resultJson.overlaySelector || resultJson.overlaySelector.trim() === '') {
                throw new Error("AI could not identify a blocking overlay.");
            }
            return { overlaySelector: resultJson.overlaySelector.trim(), scrollSelector: resultJson.scrollSelector?.trim() || 'body, html' };
        });
        return { selectors };
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            console.warn("ZenithGuard AI: Quota exceeded.");
            return { error: 'QUOTA_EXCEEDED' };
        }
        console.error("ZenithGuard Adblock Wall Defeat Error:", error.message);
        return { error: error.message };
    }
}

export async function handleCookieConsent(tabId) {
    try {
        const resultData = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();

            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
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
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: AI_TEMPERATURE }
            });

            const resultJson = JSON.parse(response.text);

            if (!resultJson || !resultJson.selector || resultJson.selector.trim() === '') {
                return { result: { selector: null, action: null } };
            }

            return { result: { selector: resultJson.selector.trim(), action: resultJson.action } };
        });
        return resultData;

    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            console.warn("ZenithGuard AI: Quota exceeded.");
            return { error: 'QUOTA_EXCEEDED' };
        }
        if (error.message && error.message.includes("could not identify a consent button")) {
            return { result: { selector: null, action: null } };
        }
        if (error.message && (error.message.includes("Cannot capture restricted page") || error.message.includes("File access not enabled") || error.message.includes("Tabs cannot be edited") || error.message.includes("Action aborted"))) {
            console.warn("ZenithGuard Cookie Consent skipped:", error.message);
            return { error: error.message };
        }
        console.error("ZenithGuard Cookie Consent Error:", error.message);
        return { error: error.message };
    }
}