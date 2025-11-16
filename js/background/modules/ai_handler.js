// ai_handler.js
import { GoogleGenAI, Type } from '../google-genai.js';

let aiInstance = null;

/**
 * NEW: Resets the cached AI client instance.
 * This is called when the user updates their API key in settings.
 */
export function resetAiClient() {
    aiInstance = null;
}

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
 * @param {number} tabId The ID of the tab to perform the action on.
 * @param {Function} action A function that takes the tab object and returns a Promise.
 * @returns The result of the action.
 */
async function performActionOnVisibleTab(tabId, action) {
    let tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (error) {
        throw new Error(`Target tab with ID ${tabId} not found. It may have been closed.`);
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

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
        await chrome.tabs.get(tabId);
    } catch (e) {
        throw new Error("The target tab was closed before the action could complete.");
    }

    return await action(tab);
}


export async function analyzePage(tabId, pageUrl, networkLog) {
     try {
        const resultJson = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 50 });
            const base64Screenshot = screenshotDataUrl.split(',')[1];
            
            const filteredLog = (networkLog || [])
                .filter(req => req.status === 'blocked' && (req.type === 'script' || req.type === 'xmlhttprequest'))
                .map(req => req.url.substring(0, 200))
                .slice(0, 50);
            
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

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [ { text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }, { text: `Network Log:\n${filteredLog.join('\n')}` } ] },
                config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.1 }
            });
            
            if (response.error) throw new Error(response.error);

            return JSON.parse(response.text);
        });

        const { auditHistory = [] } = await chrome.storage.local.get('auditHistory');
        const threatCount = (resultJson.networkThreats?.length || 0) + (resultJson.visualAnnoyances?.length || 0) + (resultJson.heuristicMatches?.length || 0) + (resultJson.darkPatterns?.length || 0);
        const grade = threatCount === 0 ? 'A' : (threatCount <= 5 ? 'B' : (threatCount <= 10 ? 'C' : 'D'));
        
        auditHistory.unshift({ url: pageUrl, domain: new URL(pageUrl).hostname, date: Date.now(), grade: grade, threatCount: threatCount });
        
        if (auditHistory.length > 50) auditHistory.pop();
        await chrome.storage.local.set({ auditHistory });

        await chrome.storage.local.set({ [`ai-scan-cache-${pageUrl}`]: { data: resultJson, timestamp: Date.now() } });
        
        return { result: resultJson };

    } catch (error) {
        console.error("ZenithGuard AI Analyzer Error:", error.message);
        if (error.message === 'QUOTA_EXCEEDED') {
            return { error: 'QUOTA_EXCEEDED' };
        }
        return { error: error.message };
    }
}


export async function handleHideElementWithAI(description, context) {
    try {
        const resultData = await performActionOnVisibleTab(context.tabId, async (activeTab) => {
            const ai = await getAiClient();
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 20 });
            const base64Screenshot = screenshotDataUrl.split(',')[1];
            
            let prompt = `Analyze the provided webpage screenshot. The user wants to hide an element they've described as: "${description}". Based on this description and the visual context of the screenshot, generate the most robust and specific CSS selector possible to uniquely identify and hide this element.`;
            if (context && context.tag) {
                 prompt += ` The user initially clicked on a <${context.tag}> element`;
                 if (context.text) prompt += ` containing text like "${context.text}".`;
                 if (context.classes) prompt += ` with classes "${context.classes}".`;
            }
            
            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, selector: { type: Type.STRING } } };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.1 }
            });

            if (response.error) throw new Error(response.error);
            const resultJson = JSON.parse(response.text);
            if (!resultJson.selector || resultJson.selector.trim() === '') {
                throw new Error("AI failed to generate a valid selector.");
            }
            return { selector: resultJson.selector.trim() };
        });
        return resultData;
    } catch(error) {
        console.error("ZenithGuard AI Hider Error:", error.message);
        if (error.message === 'QUOTA_EXCEEDED') {
            return { error: 'QUOTA_EXCEEDED' };
        }
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
            model: 'gemini-2.5-flash',
            contents: `Privacy Policy Text:\n\n${html}`,
            config: { systemInstruction, responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.0 }
        });
        
        if (aiResponse.error) throw new Error(aiResponse.error);
        return JSON.parse(aiResponse.text);

    } catch (error) {
        console.error("ZenithGuard: Failed to summarize privacy policy:", error);
        if (error.message === 'QUOTA_EXCEEDED') {
            throw new Error('QUOTA_EXCEEDED');
        }
        return null;
    }
}

export async function handleSelfHealRule(brokenSelector, tabId, pageUrl) {
    try {
        const resultData = await performActionOnVisibleTab(tabId, async (activeTab) => {
            const ai = await getAiClient();
            const screenshotDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'jpeg', quality: 20 });
            const base64Screenshot = screenshotDataUrl.split(',')[1];
            
            const prompt = `On the webpage at ${pageUrl}, the following CSS selector was used to hide an unwanted element, but it no longer works: "${brokenSelector}". 
            Based on the screenshot, analyze the page and generate a NEW, robust CSS selector that targets the element this old selector was most likely trying to hide.
            The element is probably an ad, a banner, a newsletter signup, or a similar annoyance. Prioritize stable attributes.`;

            const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, newSelector: { type: Type.STRING } }, required: ["newSelector"] };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.1 }
            });

            if (response.error) throw new Error(response.error);
            const resultJson = JSON.parse(response.text);
            if (!resultJson.newSelector || resultJson.newSelector.trim() === '' || resultJson.newSelector === brokenSelector) {
                throw new Error("AI could not generate a valid new selector.");
            }
            return { newSelector: resultJson.newSelector.trim() };
        });
        return resultData;
    } catch(error) {
        console.error("ZenithGuard Self-Heal Error:", error.message);
        if (error.message === 'QUOTA_EXCEEDED') {
            return { error: 'QUOTA_EXCEEDED' };
        }
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
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
                config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.1 }
            });

            if (response.error) throw new Error(response.error);
            const resultJson = JSON.parse(response.text);
            if (!resultJson.overlaySelector || resultJson.overlaySelector.trim() === '') {
                throw new Error("AI could not identify a blocking overlay.");
            }
            return { overlaySelector: resultJson.overlaySelector.trim(), scrollSelector: resultJson.scrollSelector?.trim() || 'body, html' };
        });
        return { selectors };
    } catch(error) {
        console.error("ZenithGuard Adblock Wall Defeat Error:", error.message);
        if (error.message === 'QUOTA_EXCEEDED') {
            return { error: 'QUOTA_EXCEEDED' };
        }
        return { error: error.message };
    }
}

export async function handleCookieConsent(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active) {
            return { result: { selector: null, action: null } };
        }

        const ai = await getAiClient();
        
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 20 });
        const base64Screenshot = screenshotDataUrl.split(',')[1];
        
        const prompt = `Analyze the provided webpage screenshot for a cookie consent banner. Your goal is to find the single button that is best for user privacy. 
        1. Prioritize buttons with text like 'Reject All', 'Deny', 'Decline', 'Necessary Cookies Only', 'Save Preferences' (if options can be deselected), or 'Manage Settings'.
        2. If no rejection option is visible, as a LAST RESORT, find the button to accept and dismiss the banner, like 'Accept All', 'OK', 'Allow', or 'Got it'.
        3. If no cookie banner or relevant button is visible in the screenshot, you MUST return null for the 'selector' and 'action' properties.
        Return a single, robust CSS selector for the identified button and classify your action.
        IMPORTANT: The returned selector must be a standard, valid CSS selector usable by 'document.querySelector()'. DO NOT use non-standard pseudo-classes like ':has-text()' or ':contains()'.`;

        const responseSchema = { type: Type.OBJECT, properties: { reasoning: { type: Type.STRING }, selector: { type: Type.STRING }, action: { type: Type.STRING } } };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Screenshot } }] },
            config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.1 }
        });

        if (response.error) throw new Error(response.error);
        const resultJson = JSON.parse(response.text);
        
        if (!resultJson || !resultJson.selector || resultJson.selector.trim() === '') {
            return { result: { selector: null, action: null } };
        }
        
        return { result: { selector: resultJson.selector.trim(), action: resultJson.action } };
        
    } catch(error) {
        if (error.message === 'QUOTA_EXCEEDED') {
             return { error: 'QUOTA_EXCEEDED' };
        }
        if (error.message.includes("could not identify a consent button")) {
             return { result: { selector: null, action: null } };
        }
        return { error: error.message };
    }
}
