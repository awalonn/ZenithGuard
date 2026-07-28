import { getLocal, setLocal } from "../../shared/storage_api";
import { hostnamesMatch } from "../../shared/hostname_matching";
import { getDisplayHostname, getDisplayUrl, getAiScanCacheKey } from "./privacy/formatting";
import {
    AI_ANALYZER_CAPTURE_QUALITY,
    AI_DEFAULT_CAPTURE_QUALITY,
    AI_DEFAULT_TEMPERATURE,
    AI_NETWORK_LOG_LIMIT,
    AI_NETWORK_URL_PREVIEW_LENGTH,
    AI_WALL_FIX_CAPTURE_QUALITY,
} from "./ai/config";
import {
    getActiveGeminiModel,
    getGeminiClient,
    resetGeminiClient,
    type GeminiGenerateContentRequest,
} from "./ai/client";
import {
    ANALYZER_PROMPT,
    ANALYZER_RESPONSE_SCHEMA,
    buildHideElementPrompt,
    buildNetworkSummarySystemPrompt,
    buildSelfHealPrompt,
    COOKIE_CONSENT_PROMPT,
    COOKIE_CONSENT_RESPONSE_SCHEMA,
    HIDE_WITH_AI_RESPONSE_SCHEMA,
    NETWORK_SUMMARY_RESPONSE_SCHEMA,
    PRIVACY_POLICY_RESPONSE_SCHEMA,
    PRIVACY_POLICY_SYSTEM_PROMPT,
    SELF_HEAL_RESPONSE_SCHEMA,
    buildWallFixPrompt,
    WALL_FIX_RESPONSE_SCHEMA,
} from "./ai/prompt_schemas";
import { getErrorMessage } from "./ai/local_ai_runtime";

type NetworkLogEntry = {
    url: string;
    status: string;
    type?: string;
};

type AnalyzePageResult = {
    success?: boolean;
    result?: Record<string, unknown>;
    error?: string;
};

type CookieConsentResult = {
    error?: string;
    result?: {
        selector?: string | null;
        action?: string | null;
    };
};

type WallFixSelectors = {
    overlaySelector: string;
    overlaySelectors?: string[];
    scrollSelector?: string;
    contentUnlockSelector?: string;
    contentUnlockSelectors?: string[];
    reasoning?: string;
};

type WallFixPageContext = {
    pageTitle?: string;
    visibleText?: string;
    blockerCandidates?: string[];
    contentCandidates?: string[];
};

type WallFixResult = {
    error?: string;
    selectors?: WallFixSelectors;
};

type NetworkSummaryResult = {
    summary?: string;
    error?: string;
};

type AuditHistoryEntry = {
    url: string;
    domain: string;
    date: number;
    grade: string;
    threatCount: number;
};

type AnalyzePageOutput = {
    networkThreats?: Array<Record<string, unknown>>;
    visualAnnoyances?: Array<Record<string, unknown>>;
    heuristicMatches?: Array<Record<string, unknown>>;
    darkPatterns?: Array<Record<string, unknown>>;
};

type PrivacyPolicySummary = {
    summary?: string;
    dataCollected?: string[];
    sharedWith?: string[];
    error?: string;
};

export type RecoveredAiModule = {
    analyzePage: (tabId: number, pageUrl: string, networkLogs: NetworkLogEntry[]) => Promise<AnalyzePageResult>;
    handleHideElementWithAI: (
        description: string,
        context: Record<string, unknown>,
    ) => Promise<{ selector?: string; error?: string }>;
    handleDefeatAdblockWall: (
        tabId: number,
        onProgress?: (message: string) => Promise<void>,
    ) => Promise<WallFixResult>;
    handleCookieConsent: (tabId: number) => Promise<CookieConsentResult>;
    handleSummarizePrivacyPolicy: (policyUrl: string) => Promise<PrivacyPolicySummary>;
    resetAiClient: () => Promise<void>;
    handleSelfHealRule: (
        selector: string,
        tabId: number,
        pageUrl: string,
    ) => Promise<{ newSelector?: string; error?: string }>;
    handleGenerateNetworkSummary: (networkLogs: NetworkLogEntry[], domain: string) => Promise<NetworkSummaryResult>;
};

const AI_TIMEOUT_MS = 40_000;
const WALL_FIX_TIMEOUT_MS = 60_000;
const PRIVACY_POLICY_FETCH_TIMEOUT_MS = 15_000;
const CAPTURE_FOCUS_DELAY_MS = 500;
const MAX_AUDIT_HISTORY = 50;
const WALL_FIX_VISIBLE_TEXT_LIMIT = 900;
const RESTRICTED_PROTOCOL_PREFIXES = ["chrome:", "edge:", "about:", "mozilla:", "view-source:"];
const UNSAFE_WALL_SELECTORS = new Set(["html", "body", "main", "#app", "#root", "#__next", "[data-reactroot]", "*"]);

let cachedAiModule: RecoveredAiModule | null = null;

function delay(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function stripCodeFences(value: string): string {
    return value.replace(/```json\n?|\n?```/g, "").trim();
}

function parseJsonResponse<T>(value: string, fallback: T): T {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(stripCodeFences(value)) as T;
    } catch (error) {
        console.warn("ZenithGuard: Failed to parse AI JSON response.", error);
        return fallback;
    }
}

function raceTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorCode)), timeoutMs)),
    ]);
}

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function isSameSiteHostname(hostname: string, pageHostname: string): boolean {
    if (!hostname || !pageHostname) {
        return false;
    }

    return hostnamesMatch(hostname, pageHostname);
}

function toBlockedThreatGrade(threatCount: number): string {
    if (threatCount === 0) {
        return "A";
    }
    if (threatCount <= 5) {
        return "B";
    }
    if (threatCount <= 10) {
        return "C";
    }
    return "D";
}

function sanitizeAnalyzeOutput(result: AnalyzePageOutput): AnalyzePageOutput {
    return {
        networkThreats: Array.isArray(result.networkThreats) ? result.networkThreats : [],
        visualAnnoyances: Array.isArray(result.visualAnnoyances) ? result.visualAnnoyances : [],
        heuristicMatches: Array.isArray(result.heuristicMatches) ? result.heuristicMatches : [],
        darkPatterns: Array.isArray(result.darkPatterns) ? result.darkPatterns : [],
    };
}

function normalizeConsentAction(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function isUnsafeWallSelector(selector: string): boolean {
    const tokens = selector
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);

    if (tokens.length === 0) {
        return true;
    }

    return tokens.some((token) => {
        if (UNSAFE_WALL_SELECTORS.has(token) || token === "html, body") {
            return true;
        }
        return token.startsWith("html ") || token.startsWith("body ");
    });
}

function sanitizeSelector(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function sanitizeSelectorList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => sanitizeSelector(entry))
        .filter(Boolean);
}

function dedupeSelectors(selectors: string[]): string[] {
    return Array.from(new Set(selectors.map((selector) => selector.trim()).filter(Boolean)));
}

function isMeaningfulWallSelector(selector: string, kind: "overlay" | "content"): boolean {
    const normalized = selector.trim().toLowerCase();
    if (!normalized) {
        return false;
    }

    if (normalized.startsWith("#zg-") || normalized.includes("zenithguard") || normalized.includes("toast")) {
        return false;
    }

    if (/^[a-z]+$/.test(normalized)) {
        return kind === "content" && (normalized === "main" || normalized === "article");
    }

    if (kind === "overlay" && (normalized.includes("nav") || normalized.includes("header") || normalized.includes("footer"))) {
        return false;
    }

    return true;
}

export function normalizeWallFixSelectors(
    result: WallFixSelectors,
    fallbackCandidates: { blockerCandidates?: string[]; contentCandidates?: string[] } = {},
): WallFixSelectors {
    const overlayCandidates = dedupeSelectors([
        ...sanitizeSelectorList(result.overlaySelectors),
        sanitizeSelector(result.overlaySelector),
        ...sanitizeSelectorList(fallbackCandidates.blockerCandidates),
    ]).filter((selector) => !isUnsafeWallSelector(selector) && isMeaningfulWallSelector(selector, "overlay"));

    const contentCandidates = dedupeSelectors([
        ...sanitizeSelectorList(result.contentUnlockSelectors),
        sanitizeSelector(result.contentUnlockSelector),
        ...sanitizeSelectorList(fallbackCandidates.contentCandidates),
    ]).filter((selector) => isMeaningfulWallSelector(selector, "content"));

    return {
        overlaySelector: overlayCandidates.join(", "),
        overlaySelectors: overlayCandidates,
        scrollSelector: sanitizeSelector(result.scrollSelector) || "body, html",
        contentUnlockSelector: contentCandidates.join(", "),
        contentUnlockSelectors: contentCandidates,
        reasoning: sanitizeSelector(result.reasoning) || "",
    };
}

function mapAiError(error: unknown, scope: string): { error: string } {
    const message = getErrorMessage(error);
    if (message === "QUOTA_EXCEEDED") {
        console.warn(`ZenithGuard ${scope}: Quota exceeded.`);
        return { error: "QUOTA_EXCEEDED" };
    }

    if (message === "AI_TIMEOUT") {
        console.warn(`ZenithGuard ${scope}: Timed out.`);
        return { error: "AI_TIMEOUT" };
    }

    if (
        message.includes("Target tab with ID")
        || message.includes("target tab was closed")
        || message.includes("No tab with id")
    ) {
        console.warn(`ZenithGuard ${scope}: Tab was closed, action aborted.`);
        return { error: "TAB_CLOSED" };
    }

    console.error(`ZenithGuard ${scope} Error:`, message);
    return { error: message };
}

async function withCapturableTab<T>(
    tabId: number,
    callback: (tab: chrome.tabs.Tab) => Promise<T>,
    options: { requireFocus?: boolean } = {},
): Promise<T> {
    let tab: chrome.tabs.Tab;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch {
        throw new Error(`Target tab with ID ${tabId} not found. It may have been closed.`);
    }

    if (!tab.url) {
        throw new Error("Tab has no URL.");
    }

    if (RESTRICTED_PROTOCOL_PREFIXES.some((prefix) => tab.url!.startsWith(prefix))) {
        throw new Error(`Cannot capture restricted page: ${tab.url}`);
    }

    if (tab.url.startsWith("file:")) {
        const hasFileAccess = await chrome.extension.isAllowedFileSchemeAccess();
        if (!hasFileAccess) {
            throw new Error("File access not enabled. Please enable 'Allow access to file URLs' in extension settings.");
        }
    }

    if (options.requireFocus !== false) {
        try {
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.update(tabId, { active: true });
        } catch (error) {
            const message = getErrorMessage(error);
            if (message.includes("Tabs cannot be edited right now")) {
                throw new Error("Action aborted: User is interacting with the tab strip.");
            }
            if (message.includes("No tab with id")) {
                throw new Error("The target tab was closed before the action could complete.");
            }
            throw error;
        }
        await delay(CAPTURE_FOCUS_DELAY_MS);
    }

    try {
        await chrome.tabs.get(tabId);
    } catch {
        throw new Error("The target tab was closed before the action could complete.");
    }

    return callback(tab);
}

async function captureTabScreenshot(tab: chrome.tabs.Tab, quality: number): Promise<string> {
    const capture = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality,
    });

    return capture.includes(",") ? capture.split(",", 2)[1] : capture;
}

async function extractWallFixPageContext(tabId: number): Promise<WallFixPageContext> {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            args: [WALL_FIX_VISIBLE_TEXT_LIMIT],
            func: (visibleTextLimit: number) => {
                const blockerKeywords = [
                    "paywall",
                    "subscribe",
                    "subscription",
                    "sign in",
                    "signin",
                    "log in",
                    "login",
                    "create account",
                    "start reading",
                    "limited time offer",
                    "save and subscribe",
                ];
                const contentKeywords = ["article", "content", "story", "body", "main", "post"];

                function escapeCssIdentifier(value: string): string {
                    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
                        return CSS.escape(value);
                    }
                    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
                }

                function selectorFor(element: Element): string {
                    const htmlElement = element as HTMLElement;
                    if (htmlElement.id) {
                        return `#${escapeCssIdentifier(htmlElement.id)}`;
                    }

                    const dataKeys = ["data-testid", "data-test", "data-qa", "data-cy", "data-role"];
                    for (const attribute of dataKeys) {
                        const value = htmlElement.getAttribute(attribute);
                        if (value) {
                            return `[${attribute}="${String(value).replace(/"/g, '\\"')}"]`;
                        }
                    }

                    const classList = Array.from(htmlElement.classList || [])
                        .filter((className) => className && className.length < 48 && !/^(css|jsx|sc)-/i.test(className))
                        .slice(0, 2);
                    if (classList.length > 0) {
                        return `${htmlElement.tagName.toLowerCase()}.${classList.map(escapeCssIdentifier).join(".")}`;
                    }

                    return "";
                }

                function isMeaningfulSelector(selector: string, kind: "overlay" | "content"): boolean {
                    const normalized = selector.trim().toLowerCase();
                    if (!normalized) {
                        return false;
                    }

                    if (normalized.startsWith("#zg-") || normalized.includes("zenithguard") || normalized.includes("toast")) {
                        return false;
                    }

                    if (kind === "overlay" && (normalized.includes("nav") || normalized.includes("header") || normalized.includes("footer"))) {
                        return false;
                    }

                    return true;
                }

                function scoreBlockerCandidate(element: Element, text: string): number {
                    const htmlElement = element as HTMLElement;
                    const computed = window.getComputedStyle(htmlElement);
                    const rect = htmlElement.getBoundingClientRect();
                    let score = 0;

                    if (text.length > 0) score += 2;
                    if (blockerKeywords.some((keyword) => text.includes(keyword))) score += 6;
                    if (computed.position === "fixed" || computed.position === "sticky") score += 4;
                    const zIndex = Number.parseInt(computed.zIndex || "0", 10);
                    if (Number.isFinite(zIndex) && zIndex >= 20) score += 3;
                    if (htmlElement.getAttribute("role") === "dialog" || htmlElement.getAttribute("aria-modal") === "true") score += 5;
                    if (rect.width >= window.innerWidth * 0.4 && rect.height >= 80) score += 2;

                    return score;
                }

                function scoreContentCandidate(element: Element, text: string): number {
                    const htmlElement = element as HTMLElement;
                    const rect = htmlElement.getBoundingClientRect();
                    const selector = selectorFor(htmlElement).toLowerCase();
                    let score = 0;

                    if (contentKeywords.some((keyword) => selector.includes(keyword) || text.includes(keyword))) score += 4;
                    if (htmlElement.tagName.toLowerCase() === "article" || htmlElement.tagName.toLowerCase() === "main") score += 4;
                    if (rect.width >= Math.min(window.innerWidth * 0.5, 500) && rect.height >= 200) score += 2;

                    return score;
                }

                const title = typeof document.title === "string" ? document.title.trim() : "";
                const text = (document.body?.innerText || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, visibleTextLimit);

                const blockerCandidates = Array.from(document.querySelectorAll("div, section, aside, dialog, form"))
                    .map((element) => {
                        const htmlElement = element as HTMLElement;
                        const textSample = (htmlElement.innerText || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 220);
                        return {
                            selector: selectorFor(htmlElement),
                            score: scoreBlockerCandidate(htmlElement, textSample),
                        };
                    })
                    .filter((candidate) => candidate.score >= 6)
                    .sort((left, right) => right.score - left.score)
                    .map((candidate) => candidate.selector)
                    .filter((selector) => isMeaningfulSelector(selector, "overlay"))
                    .filter((selector, index, array) => array.indexOf(selector) === index)
                    .slice(0, 6);

                const contentCandidates = Array.from(document.querySelectorAll("main, article, section, div"))
                    .map((element) => {
                        const htmlElement = element as HTMLElement;
                        const textSample = `${htmlElement.id || ""} ${htmlElement.className || ""}`.toLowerCase();
                        return {
                            selector: selectorFor(htmlElement),
                            score: scoreContentCandidate(htmlElement, textSample),
                        };
                    })
                    .filter((candidate) => candidate.score >= 4)
                    .sort((left, right) => right.score - left.score)
                    .map((candidate) => candidate.selector)
                    .filter((selector) => isMeaningfulSelector(selector, "content"))
                    .filter((selector, index, array) => array.indexOf(selector) === index)
                    .slice(0, 6);

                return {
                    pageTitle: title || undefined,
                    visibleText: text || undefined,
                    blockerCandidates,
                    contentCandidates,
                };
            },
        });

        return (result?.result as WallFixPageContext | undefined) || {};
    } catch {
        return {};
    }
}

async function generateJson<T>(request: GeminiGenerateContentRequest, fallback: T, timeoutMs?: number): Promise<T> {
    const client = await getGeminiClient();
    const responsePromise = client.models.generateContent(request);
    const response = timeoutMs
        ? await raceTimeout(responsePromise, timeoutMs, "AI_TIMEOUT")
        : await responsePromise;

    return parseJsonResponse<T>(response.text || "", fallback);
}

async function createUserImageJsonRequest(
    prompt: string,
    imageData: string,
    responseSchema: unknown,
    temperature = AI_DEFAULT_TEMPERATURE,
): Promise<GeminiGenerateContentRequest> {
    return {
        model: await getActiveGeminiModel(),
        contents: [
            {
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: imageData } },
                ],
            },
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema,
            temperature,
        },
    };
}

async function cacheAnalyzeResult(pageUrl: string, result: AnalyzePageOutput): Promise<void> {
    const cacheKey = getAiScanCacheKey(pageUrl);
    const { auditHistory = [] } = await getLocal<{ auditHistory?: AuditHistoryEntry[] }>("auditHistory");
    const threatCount = (result.networkThreats?.length || 0)
        + (result.visualAnnoyances?.length || 0)
        + (result.heuristicMatches?.length || 0)
        + (result.darkPatterns?.length || 0);

    const nextEntry: AuditHistoryEntry = {
        url: getDisplayUrl(pageUrl),
        domain: getHostname(pageUrl) || "unknown",
        date: Date.now(),
        grade: toBlockedThreatGrade(threatCount),
        threatCount,
    };

    const nextAuditHistory = [nextEntry, ...auditHistory].slice(0, MAX_AUDIT_HISTORY);

    await setLocal({
        auditHistory: nextAuditHistory,
        [cacheKey]: {
            data: result,
            timestamp: Date.now(),
        },
    });
}

function buildAnalyzerNetworkLogLines(pageUrl: string, networkLogs: NetworkLogEntry[]): string[] {
    const pageHostname = getHostname(pageUrl);

    return Array.from(
        new Set(
            (networkLogs || [])
                .filter((entry) => entry.type === "script" || entry.type === "xmlhttprequest" || entry.type === "sub_frame")
                .filter((entry) => {
                    const hostname = getHostname(entry.url);
                    return hostname ? !isSameSiteHostname(hostname, pageHostname) : false;
                })
                .map((entry) => `[${String(entry.status || "seen").toUpperCase()}] ${getDisplayUrl(entry.url).slice(0, AI_NETWORK_URL_PREVIEW_LENGTH)}`),
        ),
    ).slice(0, AI_NETWORK_LOG_LIMIT);
}

function extractTextFromHtml(html: string): string {
    try {
        const document = new DOMParser().parseFromString(html, "text/html");
        document.querySelectorAll("script, style, noscript, svg, img, video, meta, link").forEach((node) => node.remove());
        return (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    } catch {
        return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
}

function buildRecoveredAiModule(): RecoveredAiModule {
    return {
        async analyzePage(tabId, pageUrl, networkLogs) {
            try {
                const result = await withCapturableTab(tabId, async (tab) => {
                    const screenshot = await captureTabScreenshot(tab, AI_ANALYZER_CAPTURE_QUALITY);
                    const request = await createUserImageJsonRequest(
                        `${ANALYZER_PROMPT}\nNetwork Log:\n${buildAnalyzerNetworkLogLines(pageUrl, networkLogs).join("\n")}`,
                        screenshot,
                        ANALYZER_RESPONSE_SCHEMA,
                    );

                    return generateJson<AnalyzePageOutput>(request, {
                        networkThreats: [],
                        visualAnnoyances: [],
                        heuristicMatches: [],
                        darkPatterns: [],
                    }, AI_TIMEOUT_MS);
                });

                const sanitized = sanitizeAnalyzeOutput(result);
                await cacheAnalyzeResult(pageUrl, sanitized);
                return { success: true, result: sanitized };
            } catch (error) {
                return { error: mapAiError(error, "AI Analyzer").error || "Analysis failed." };
            }
        },

        async handleHideElementWithAI(description, context) {
            try {
                const tabId = typeof context.tabId === "number" ? context.tabId : null;
                if (tabId === null) {
                    throw new Error("AI hide requires a tabId in context.");
                }

                return await withCapturableTab(tabId, async (tab) => {
                    const screenshot = await captureTabScreenshot(tab, AI_DEFAULT_CAPTURE_QUALITY);
                    const request = await createUserImageJsonRequest(
                        buildHideElementPrompt(description, context),
                        screenshot,
                        HIDE_WITH_AI_RESPONSE_SCHEMA,
                    );

                    const result = await generateJson<{ selector?: string }>(request, { selector: "" });
                    const selector = sanitizeSelector(result.selector);
                    if (!selector) {
                        throw new Error("AI failed to generate a valid selector.");
                    }

                    return { selector };
                });
            } catch (error) {
                return { error: mapAiError(error, "AI Hider").error };
            }
        },

        async handleDefeatAdblockWall(tabId, onProgress) {
            try {
                const selectors = await withCapturableTab(tabId, async (tab) => {
                    await onProgress?.("Capturing page state...");
                    const screenshot = await captureTabScreenshot(tab, AI_WALL_FIX_CAPTURE_QUALITY);
                    const pageContext = await extractWallFixPageContext(tabId);
                    await onProgress?.("Consulting with Gemini AI...");
                    console.info(`ZenithGuard: Sending prompt to AI for tab ${tabId}...`);

                    const request = await createUserImageJsonRequest(
                        buildWallFixPrompt({
                            pageUrl: tab.url,
                            hostname: getHostname(tab.url || ""),
                            pageTitle: pageContext.pageTitle,
                            visibleText: pageContext.visibleText,
                            blockerCandidates: pageContext.blockerCandidates,
                            contentCandidates: pageContext.contentCandidates,
                        }),
                        screenshot,
                        WALL_FIX_RESPONSE_SCHEMA,
                    );

                    const result = await generateJson<WallFixSelectors>(request, { overlaySelector: "" }, WALL_FIX_TIMEOUT_MS);
                    console.info(`ZenithGuard: AI response received for tab ${tabId}.`);

                    const normalizedSelectors = normalizeWallFixSelectors(result, {
                        blockerCandidates: pageContext.blockerCandidates,
                        contentCandidates: pageContext.contentCandidates,
                    });
                    if (!normalizedSelectors.overlaySelector) {
                        throw new Error("AI could not identify a blocking overlay.");
                    }

                    return normalizedSelectors;
                });

                return { selectors };
            } catch (error) {
                return mapAiError(error, "Adblock Wall Defeat");
            }
        },

        async handleCookieConsent(tabId) {
            try {
                const tab = await chrome.tabs.get(tabId).catch(() => null);
                if (!tab || !tab.active) {
                    return { result: { selector: null, action: null } };
                }

                return await withCapturableTab(
                    tabId,
                    async (currentTab) => {
                        const screenshot = await captureTabScreenshot(currentTab, AI_DEFAULT_CAPTURE_QUALITY);
                        const request = await createUserImageJsonRequest(
                            COOKIE_CONSENT_PROMPT,
                            screenshot,
                            COOKIE_CONSENT_RESPONSE_SCHEMA,
                        );
                        const result = await generateJson<{ selector?: string; action?: string }>(request, {});
                        const selector = sanitizeSelector(result.selector);

                        if (!selector) {
                            return { result: { selector: null, action: null } };
                        }

                        return {
                            result: {
                                selector,
                                action: normalizeConsentAction(result.action),
                            },
                        };
                    },
                    { requireFocus: false },
                );
            } catch (error) {
                const message = getErrorMessage(error);
                if (message.toLowerCase().includes("could not identify a consent button")) {
                    return { result: { selector: null, action: null } };
                }
                return mapAiError(error, "Cookie Consent");
            }
        },

        async handleSummarizePrivacyPolicy(policyUrl) {
            try {
                const response = await fetch(policyUrl, { signal: AbortSignal.timeout(PRIVACY_POLICY_FETCH_TIMEOUT_MS) });
                if (!response.ok) {
                    throw new Error("Could not fetch the policy page.");
                }

                const html = await response.text();
                const text = extractTextFromHtml(html).slice(0, 15_000);
                const request: GeminiGenerateContentRequest = {
                    model: await getActiveGeminiModel(),
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `Privacy Policy Text from ${getDisplayUrl(policyUrl)}:\n\n${text}`,
                                },
                            ],
                        },
                    ],
                    config: {
                        systemInstruction: {
                            parts: [{ text: PRIVACY_POLICY_SYSTEM_PROMPT }],
                        },
                        responseMimeType: "application/json",
                        responseSchema: PRIVACY_POLICY_RESPONSE_SCHEMA,
                        temperature: 0,
                    },
                };

                return await generateJson<PrivacyPolicySummary>(request, {
                    summary: "",
                    dataCollected: [],
                    sharedWith: [],
                });
            } catch (error) {
                const message = getErrorMessage(error);
                console.error("ZenithGuard: AI Analysis failed", message);
                return { error: message || "Analysis failed." };
            }
        },

        async resetAiClient() {
            resetGeminiClient();
        },

        async handleSelfHealRule(selector, tabId, pageUrl) {
            try {
                return await withCapturableTab(tabId, async (tab) => {
                    const screenshot = await captureTabScreenshot(tab, AI_DEFAULT_CAPTURE_QUALITY);
                    const request = await createUserImageJsonRequest(
                        buildSelfHealPrompt(pageUrl, selector),
                        screenshot,
                        SELF_HEAL_RESPONSE_SCHEMA,
                    );
                    const result = await generateJson<{ newSelector?: string }>(request, { newSelector: "" });
                    const newSelector = sanitizeSelector(result.newSelector);
                    if (!newSelector || newSelector === selector) {
                        throw new Error("AI could not generate a valid new selector.");
                    }
                    return { newSelector };
                });
            } catch (error) {
                return { error: mapAiError(error, "Self-Heal").error };
            }
        },

        async handleGenerateNetworkSummary(networkLogs, domain) {
            try {
                const blockedDomains = Array.from(
                    new Set(
                        (networkLogs || [])
                            .filter((entry) => entry.status === "blocked")
                            .map((entry) => getHostname(entry.url))
                            .filter((hostname) => hostname.length > 0),
                    ),
                ).slice(0, 30);

                if (blockedDomains.length === 0) {
                    return { summary: "No third-party trackers or malicious network requests were detected on this page." };
                }

                const request: GeminiGenerateContentRequest = {
                    model: await getActiveGeminiModel(),
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `Blocked Tracker Domains:\n${blockedDomains.join("\n")}`,
                                },
                            ],
                        },
                    ],
                    config: {
                        systemInstruction: {
                            parts: [{ text: buildNetworkSummarySystemPrompt(getDisplayHostname(domain) || domain) }],
                        },
                        responseMimeType: "application/json",
                        responseSchema: NETWORK_SUMMARY_RESPONSE_SCHEMA,
                        temperature: 0.2,
                    },
                };

                const result = await generateJson<{ summary?: string }>(request, {});
                const summary = typeof result.summary === "string" ? result.summary.trim() : "";
                if (!summary) {
                    throw new Error("AI failed to generate a summary.");
                }

                return { summary };
            } catch (error) {
                return { error: mapAiError(error, "Privacy Report Gen").error };
            }
        },
    };
}

export async function getAiHandlerModule(): Promise<RecoveredAiModule> {
    if (!cachedAiModule) {
        cachedAiModule = buildRecoveredAiModule();
    }

    return cachedAiModule;
}

export async function resetRecoveredAiModule(): Promise<void> {
    resetGeminiClient();
    cachedAiModule = buildRecoveredAiModule();
}
