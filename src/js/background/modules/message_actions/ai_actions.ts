import type { ContentMessage } from "../../../shared/content_messages";
import { sendContentMessage, sendContentMessageSafely } from "../../../shared/runtime_messages";
import { getLocal, setLocal, getSync } from "../../../shared/storage_api";
import { findMatchingRecordEntry } from "../../../shared/hostname_matching";
import { normalizeTemporaryWallFixMap } from "../../../shared/site_bucket_maps";
import {
    appendWallAssistTraceStage,
    completeWallAssistTrace,
    startWallAssistTrace,
} from "../../../shared/wall_assist_trace";
import {
    classifyTextLocally,
    getErrorMessage,
    type LocalAiClassificationResult,
} from "../ai/local_ai_runtime";

const ANALYZE_COOLDOWN_MS = 10_000;
const LOCAL_AI_CACHE_MAX = 4_000;
const LOCAL_AI_CACHE_TTL_MS = 30 * 60 * 1000;
const LOCAL_AI_MIN_TEXT_LENGTH = 16;
const LOCAL_AI_MAX_CONCURRENT = 2;
const LOCAL_AI_MAX_QUEUE = 24;
const TAB_CLOSED = "TAB_CLOSED";

type WallFixSelectors = Extract<ContentMessage, { type: "EXECUTE_ADBLOCK_WALL_FIX" }>["selectors"];

type NetworkLogEntry = {
    url: string;
    status: string;
    type?: string;
};

export type AiModule = {
    analyzePage: (tabId: number, pageUrl: string, networkLogs: NetworkLogEntry[]) => Promise<unknown>;
    handleHideElementWithAI: (description: string, context: Record<string, unknown>) => Promise<unknown>;
    handleDefeatAdblockWall: (
        tabId: number,
        onProgress?: (message: string) => Promise<void>,
    ) => Promise<{ error?: string; selectors?: Record<string, unknown> }>;
    handleCookieConsent: (tabId: number) => Promise<{ error?: string; result?: { selector?: string | null; action?: string | null } }>;
    resetAiClient: () => void | Promise<void>;
    handleSelfHealRule: (selector: string, tabId: number, pageUrl: string) => Promise<unknown>;
    handleGenerateNetworkSummary?: (networkLogs: NetworkLogEntry[], domain: string) => Promise<{ summary?: string; error?: string }>;
};

type AiActionDeps = {
    getNetworkLogs: (tabId: number) => NetworkLogEntry[];
    getAiModule: () => Promise<AiModule>;
};

type AiActionRegistry = {
    actions: {
        ANALYZE_PAGE_WITH_AI: (message: { data: { tabId: number; pageUrl: string } }) => Promise<unknown>;
        HIDE_ELEMENT_WITH_AI: (message: { data: { description: string; context?: Record<string, unknown> } }, sender: chrome.runtime.MessageSender) => Promise<unknown>;
        DEFEAT_ADBLOCK_WALL: (message: { data: { tabId: number } }) => Promise<unknown>;
        HANDLE_COOKIE_CONSENT: (message: { data: { tabId: number } }) => Promise<unknown>;
        API_KEY_UPDATED: () => Promise<{ success: true }>;
        SELF_HEAL_RULE: (message: { data: { selector: string; pageUrl: string } }, sender: chrome.runtime.MessageSender) => Promise<unknown>;
        CLASSIFY_TEXT_LOCALLY: (message: { data: { text: string } }) => Promise<LocalAiClassificationResult>;
    };
    onTabRemoved: (tabId: number) => void;
};

type CachedLocalAiClassification = LocalAiClassificationResult & { timestamp: number };
type TemporaryWallFixState = {
    overlaySelector?: string;
    scrollSelector?: string;
    contentUnlockSelector?: string;
    reasoning?: string;
};

type GateSettings = {
    enabled: boolean | null;
    performanceMode: boolean | null;
};

class ConcurrencyLimiter {
    private activeCount = 0;
    private readonly waitQueue: Array<() => void> = [];

    constructor(
        private readonly maxConcurrent: number,
        private readonly maxQueued: number,
    ) {}

    private async acquire(): Promise<boolean> {
        if (this.activeCount < this.maxConcurrent) {
            this.activeCount += 1;
            return true;
        }

        if (this.waitQueue.length >= this.maxQueued) {
            return false;
        }

        await new Promise<void>((resolve) => {
            this.waitQueue.push(resolve);
        });
        this.activeCount += 1;
        return true;
    }

    private release(): void {
        this.activeCount = Math.max(0, this.activeCount - 1);
        const next = this.waitQueue.shift();
        next?.();
    }

    async run<T>(task: () => Promise<T>): Promise<T | null> {
        if (!(await this.acquire())) {
            return null;
        }

        try {
            return await task();
        } finally {
            this.release();
        }
    }
}

const analysisCooldown = new Map<number, number>();
const localAiCache = new Map<string, CachedLocalAiClassification>();
const localAiLimiter = new ConcurrencyLimiter(LOCAL_AI_MAX_CONCURRENT, LOCAL_AI_MAX_QUEUE);
let cachedGateSettings: GateSettings = { enabled: null, performanceMode: null };
let gateSettingsListenerAttached = false;
let gateSettingsLoadPromise: Promise<boolean> | null = null;
let settingsVersion = 0;

function normalizeCacheKey(value: string): string {
    return value.trim().toLowerCase();
}

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function attachGateSettingsListener(): void {
    if (gateSettingsListenerAttached) {
        return;
    }

    gateSettingsListenerAttached = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") {
            return;
        }

        let touched = false;
        if (changes.isNextGenAIEradicatorEnabled) {
            cachedGateSettings.enabled = Boolean(changes.isNextGenAIEradicatorEnabled.newValue);
            touched = true;
        }
        if (changes.isPerformanceModeEnabled) {
            cachedGateSettings.performanceMode = Boolean(changes.isPerformanceModeEnabled.newValue);
            touched = true;
        }
        if (touched) {
            settingsVersion += 1;
        }
    });
}

function currentLocalAiGateState(): boolean | null {
    if (typeof cachedGateSettings.enabled !== "boolean" || typeof cachedGateSettings.performanceMode !== "boolean") {
        return null;
    }

    return cachedGateSettings.enabled && !cachedGateSettings.performanceMode;
}

async function primeLocalAiGateState(): Promise<boolean> {
    attachGateSettingsListener();

    const currentState = currentLocalAiGateState();
    if (currentState !== null) {
        return currentState;
    }

    if (!gateSettingsLoadPromise) {
        gateSettingsLoadPromise = (async () => {
            const version = settingsVersion;
            const settings = await getSync<{
                isNextGenAIEradicatorEnabled?: boolean;
                isPerformanceModeEnabled?: boolean;
            }>(["isNextGenAIEradicatorEnabled", "isPerformanceModeEnabled"]);
            const enabled = settings.isNextGenAIEradicatorEnabled !== false;
            const performanceMode = Boolean(settings.isPerformanceModeEnabled);
            if (settingsVersion === version) {
                cachedGateSettings = { enabled, performanceMode };
            }
            return enabled && !performanceMode;
        })().finally(() => {
            gateSettingsLoadPromise = null;
        });
    }

    return gateSettingsLoadPromise;
}

function canUseLocalAiInsights(): boolean {
    attachGateSettingsListener();
    void primeLocalAiGateState();
    return currentLocalAiGateState() === true;
}

function pruneLocalAiCache(now: number, ttlMs: number): void {
    for (const [key, entry] of localAiCache) {
        if (now - entry.timestamp > ttlMs) {
            localAiCache.delete(key);
        }
    }

    while (localAiCache.size > LOCAL_AI_CACHE_MAX) {
        const oldestKey = localAiCache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        localAiCache.delete(oldestKey);
    }
}

function getCachedClassification(key: string, ttlMs: number): LocalAiClassificationResult | null {
    const normalizedKey = normalizeCacheKey(key);
    if (!normalizedKey) {
        return null;
    }

    const cachedEntry = localAiCache.get(normalizedKey);
    if (!cachedEntry) {
        return null;
    }

    if (Date.now() - cachedEntry.timestamp > ttlMs) {
        localAiCache.delete(normalizedKey);
        return null;
    }

    return {
        isAdRelated: cachedEntry.isAdRelated,
        confidence: cachedEntry.confidence,
    };
}

function setCachedClassification(key: string, result: LocalAiClassificationResult, timestamp = Date.now()): void {
    const normalizedKey = normalizeCacheKey(key);
    if (!normalizedKey) {
        return;
    }

    localAiCache.delete(normalizedKey);
    localAiCache.set(normalizedKey, {
        isAdRelated: result.isAdRelated,
        confidence: result.confidence,
        timestamp,
    });
    pruneLocalAiCache(timestamp, LOCAL_AI_CACHE_TTL_MS);
}

async function classifyTextWithLimiter(text: string): Promise<LocalAiClassificationResult | null> {
    const result = await localAiLimiter.run(async () => classifyTextLocally(text));
    if (!result || result.error) {
        return null;
    }

    return {
        isAdRelated: result.isAdRelated,
        confidence: result.confidence,
    };
}

async function classifyTextWithGate(
    text: string,
    options: { enforceGate?: boolean; minTextLength?: number } = {},
): Promise<LocalAiClassificationResult | null> {
    const minTextLength = options.minTextLength ?? LOCAL_AI_MIN_TEXT_LENGTH;
    const enforceGate = options.enforceGate ?? true;
    const normalizedText = text.trim();

    if (normalizedText.length < minTextLength) {
        return null;
    }

    if (enforceGate && !(await primeLocalAiGateState())) {
        return null;
    }

    return classifyTextWithLimiter(normalizedText);
}

async function classifyDomainWithCache(
    domain: string,
    text: string,
    options: { cacheTtlMs?: number; enforceGate?: boolean; minTextLength?: number } = {},
): Promise<LocalAiClassificationResult | null> {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) {
        return null;
    }

    const cacheTtlMs = options.cacheTtlMs ?? LOCAL_AI_CACHE_TTL_MS;
    const cachedResult = getCachedClassification(normalizedDomain, cacheTtlMs);
    if (cachedResult) {
        return cachedResult;
    }

    const classified = await classifyTextWithGate(text, options);
    if (classified) {
        setCachedClassification(normalizedDomain, classified);
    }
    return classified;
}

function tabCanRunAiAction(sender: chrome.runtime.MessageSender): sender is chrome.runtime.MessageSender & { tab: chrome.tabs.Tab & { id: number } } {
    return Boolean(sender.tab && typeof sender.tab.id === "number");
}

function markAnalysisRun(tabId: number, now = Date.now()): boolean {
    const lastRunAt = analysisCooldown.get(tabId);
    if (typeof lastRunAt === "number" && now - lastRunAt < ANALYZE_COOLDOWN_MS) {
        return false;
    }

    analysisCooldown.set(tabId, now);
    return true;
}

function clearAnalysisCooldown(tabId: number): void {
    analysisCooldown.delete(tabId);
}

async function broadcastToTabFrames(tabId: number, message: ContentMessage): Promise<number> {
    try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        if (!frames || frames.length === 0) {
            await sendContentMessageSafely(tabId, message);
            return 1;
        }

        await Promise.allSettled(
            frames.map((frame) => sendContentMessageSafely(tabId, message, { frameId: frame.frameId })),
        );
        return frames.length;
    } catch {
        await sendContentMessageSafely(tabId, message);
        return 1;
    }
}

async function broadcastWallFixToTabFrames(
    tabId: number,
    selectors: WallFixSelectors,
): Promise<{ frameCount: number; overlayMatchCount: number; contentUnlockMatchCount: number }> {
    const empty = { frameCount: 0, overlayMatchCount: 0, contentUnlockMatchCount: 0 };

    try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        const targetFrames = frames && frames.length > 0 ? frames : [{ frameId: 0 }];
        const results = await Promise.allSettled(
            targetFrames.map((frame) => sendContentMessage<{
                success?: boolean;
                overlayMatchCount?: number;
                contentUnlockMatchCount?: number;
            }>(tabId, {
                type: "EXECUTE_ADBLOCK_WALL_FIX",
                selectors,
            }, { frameId: frame.frameId })),
        );

        return results.reduce((accumulator, result) => {
            if (result.status !== "fulfilled") {
                return accumulator;
            }

            return {
                frameCount: accumulator.frameCount + 1,
                overlayMatchCount: accumulator.overlayMatchCount + (typeof result.value.overlayMatchCount === "number" ? result.value.overlayMatchCount : 0),
                contentUnlockMatchCount: accumulator.contentUnlockMatchCount + (typeof result.value.contentUnlockMatchCount === "number" ? result.value.contentUnlockMatchCount : 0),
            };
        }, empty);
    } catch {
        try {
            const result = await sendContentMessage<{
                success?: boolean;
                overlayMatchCount?: number;
                contentUnlockMatchCount?: number;
            }>(tabId, {
                type: "EXECUTE_ADBLOCK_WALL_FIX",
                selectors,
            });

            return {
                frameCount: 1,
                overlayMatchCount: typeof result.overlayMatchCount === "number" ? result.overlayMatchCount : 0,
                contentUnlockMatchCount: typeof result.contentUnlockMatchCount === "number" ? result.contentUnlockMatchCount : 0,
            };
        } catch {
            return empty;
        }
    }
}

function normalizeWallFixSelectors(selectors: Record<string, unknown>): WallFixSelectors | null {
    const overlaySelector = typeof selectors.overlaySelector === "string" ? selectors.overlaySelector.trim() : "";
    if (!overlaySelector) {
        return null;
    }

    const scrollSelector = typeof selectors.scrollSelector === "string" ? selectors.scrollSelector.trim() : "";
    const contentUnlockSelector = typeof selectors.contentUnlockSelector === "string" ? selectors.contentUnlockSelector.trim() : "";

    return {
        overlaySelector,
        scrollSelector: scrollSelector || undefined,
        contentUnlockSelector: contentUnlockSelector || undefined,
    };
}

async function persistTemporaryWallFix(hostname: string, selectors: Record<string, unknown>): Promise<void> {
    const overlaySelector = typeof selectors.overlaySelector === "string" ? selectors.overlaySelector.trim() : "";
    if (!hostname || !overlaySelector) {
        return;
    }

    const snapshot = await getLocal<{ temporaryWallFixes?: Record<string, TemporaryWallFixState> }>("temporaryWallFixes");
    const bucketKey = findMatchingRecordEntry(snapshot.temporaryWallFixes, hostname)?.key || hostname;
    const nextTemporaryWallFixes = normalizeTemporaryWallFixMap({
        ...(snapshot.temporaryWallFixes || {}),
        [bucketKey]: {
            overlaySelector,
            scrollSelector: typeof selectors.scrollSelector === "string" && selectors.scrollSelector.trim()
                ? selectors.scrollSelector.trim()
                : undefined,
            contentUnlockSelector: typeof selectors.contentUnlockSelector === "string" && selectors.contentUnlockSelector.trim()
                ? selectors.contentUnlockSelector.trim()
                : undefined,
            reasoning: typeof selectors.reasoning === "string" && selectors.reasoning.trim()
                ? selectors.reasoning.trim()
                : undefined,
        },
    });
    await setLocal({
        temporaryWallFixes: nextTemporaryWallFixes,
    });
}

async function clearProcessingToast(tabId: number): Promise<void> {
    await sendContentMessageSafely(tabId, { type: "CLEAR_PROCESSING_TOAST" });
}

async function getWallAssistTarget(tabId: number): Promise<{ hostname: string | null; pageUrl?: string }> {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url) {
            return { hostname: null };
        }

        return {
            hostname: getHostname(tab.url) || null,
            pageUrl: tab.url,
        };
    } catch {
        return { hostname: null };
    }
}

function describeWallAssistError(error: string): {
    summary: string;
    finalStageLabel: string;
} {
    if (error === "AI_TIMEOUT") {
        return {
            summary: "Wall assist timed out while waiting for Gemini to respond.",
            finalStageLabel: "Gemini did not answer before the timeout window.",
        };
    }

    if (error === "QUOTA_EXCEEDED") {
        return {
            summary: "Wall assist stopped because the Gemini quota was exhausted.",
            finalStageLabel: "Gemini quota was exhausted before the run could finish.",
        };
    }

    if (error === TAB_CLOSED) {
        return {
            summary: "Wall assist stopped because the target tab changed or closed.",
            finalStageLabel: "The target tab was no longer available.",
        };
    }

    return {
        summary: `Wall assist stopped: ${error}`,
        finalStageLabel: "Run finished with an error result.",
    };
}

function mapAiError(error: unknown, scope: string): { error: string } {
    const message = getErrorMessage(error);
    if (message === "QUOTA_EXCEEDED") {
        console.warn(`ZenithGuard ${scope}: Quota exceeded.`);
        return { error: "QUOTA_EXCEEDED" };
    }

    if (
        message.includes("Target tab with ID")
        || message.includes("target tab was closed")
        || message.includes("No tab with id")
    ) {
        console.warn(`ZenithGuard ${scope}: Tab was closed, action aborted.`);
        return { error: TAB_CLOSED };
    }

    console.error(`ZenithGuard ${scope} Error:`, message);
    return { error: message };
}

function looksActionableKeyword(keyword: string): boolean {
    if (!keyword || keyword.length < 4) {
        return false;
    }

    if (keyword.startsWith("/") || keyword.includes(".") || keyword.includes("-") || keyword.includes("_")) {
        return true;
    }

    return [
        "track",
        "beacon",
        "pixel",
        "finger",
        "consent",
        "replay",
        "session",
        "telemetry",
        "ad",
        "promo",
        "offer",
        "wall",
        "loader",
        "popunder",
        "identify",
        "surveil",
    ].some((token) => keyword.includes(token));
}

function filterAnalyzerResult(result: Record<string, unknown>, networkLogs: NetworkLogEntry[]): Record<string, unknown> {
    const blockedHosts = new Set(
        networkLogs
            .filter((entry) => entry.status === "blocked")
            .map((entry) => getHostname(entry.url))
            .filter((hostname) => hostname.length > 0),
    );

    const networkThreats = Array.isArray(result.networkThreats) ? result.networkThreats : [];
    for (const threat of networkThreats) {
        if (threat && typeof threat === "object" && "url" in threat) {
            const hostname = getHostname(String((threat as { url?: unknown }).url || ""));
            if (hostname) {
                blockedHosts.add(hostname);
            }
        }
    }

    const heuristicMatches = (Array.isArray(result.heuristicMatches) ? result.heuristicMatches : []).filter((match) => {
        if (!match || typeof match !== "object") {
            return false;
        }

        const keyword = String((match as { keyword?: unknown }).keyword || "").trim().toLowerCase();
        if (!looksActionableKeyword(keyword)) {
            return false;
        }

        const hostname = getHostname(String((match as { url?: unknown }).url || ""));
        return !(hostname && blockedHosts.has(hostname));
    });

    return {
        networkThreats,
        visualAnnoyances: Array.isArray(result.visualAnnoyances) ? result.visualAnnoyances : [],
        heuristicMatches,
        darkPatterns: Array.isArray(result.darkPatterns) ? result.darkPatterns : [],
    };
}

export function createAiActionRegistry(deps: AiActionDeps): AiActionRegistry {
    return {
        actions: {
            ANALYZE_PAGE_WITH_AI: async (message) => {
                const { tabId, pageUrl } = message.data;
                if (!markAnalysisRun(tabId)) {
                    return { error: "Please wait before re-running the analysis." };
                }

                try {
                    const result = await (await deps.getAiModule()).analyzePage(tabId, pageUrl, deps.getNetworkLogs(tabId));
                    if (result && typeof result === "object" && "result" in result) {
                        const payload = result as { result?: Record<string, unknown> };
                        if (payload.result) {
                            return { ...result, result: filterAnalyzerResult(payload.result, deps.getNetworkLogs(tabId)) };
                        }
                    }
                    return result;
                } catch (error) {
                    return mapAiError(error, "AI Analyzer");
                }
            },

            HIDE_ELEMENT_WITH_AI: async (message, sender) => {
                if (!tabCanRunAiAction(sender)) {
                    return { error: TAB_CLOSED };
                }

                try {
                    return await (await deps.getAiModule()).handleHideElementWithAI(message.data.description, {
                        ...(message.data.context || {}),
                        tabId: sender.tab.id,
                    });
                } catch (error) {
                    return mapAiError(error, "AI Hider");
                }
            },

            DEFEAT_ADBLOCK_WALL: async (message) => {
                const { tabId } = message.data;
                const aiModule = await deps.getAiModule();
                const target = await getWallAssistTarget(tabId);
                const hostname = target.hostname;

                if (hostname) {
                    await startWallAssistTrace(hostname, target.pageUrl);
                    await appendWallAssistTraceStage(hostname, "Background received the wall-assist request.");
                }

                const reportProgress = async (status: string) => {
                    if (hostname) {
                        await appendWallAssistTraceStage(hostname, status);
                    }
                    await sendContentMessageSafely(tabId, {
                        type: "SHOW_PROCESSING_TOAST",
                        message: status,
                    });
                };

                try {
                    const result = await aiModule.handleDefeatAdblockWall(tabId, reportProgress);
                    if (result.error) {
                        await clearProcessingToast(tabId);
                        if (hostname) {
                            const description = describeWallAssistError(result.error);
                            await completeWallAssistTrace(hostname, {
                                status: "error",
                                pageUrl: target.pageUrl,
                                summary: description.summary,
                                lastError: result.error,
                                finalStageLabel: description.finalStageLabel,
                                finalStageTone: "error",
                            });
                        }
                        if (result.error === "AI_TIMEOUT") {
                            await sendContentMessageSafely(tabId, {
                                type: "SHOW_ERROR_TOAST",
                                message: "Defeat Wall timed out. Retry once, or use Inspector for a manual cleanup on this page.",
                            });
                        }
                        return result;
                    }

                    const wallFixSelectors = result.selectors ? normalizeWallFixSelectors(result.selectors) : null;
                    if (wallFixSelectors) {
                        if (hostname) {
                            await appendWallAssistTraceStage(hostname, "AI returned selector candidates.");
                        }
                        const applyResult = await broadcastWallFixToTabFrames(tabId, wallFixSelectors);
                        console.info(
                            `ZenithGuard: Broadcasted wall-fix to ${applyResult.frameCount} frames. Overlay matches: ${applyResult.overlayMatchCount}. Content unlock matches: ${applyResult.contentUnlockMatchCount}.`,
                        );
                        if (hostname && (applyResult.overlayMatchCount > 0 || applyResult.contentUnlockMatchCount > 0)) {
                            await persistTemporaryWallFix(hostname, wallFixSelectors);
                        }
                        if (hostname) {
                            await appendWallAssistTraceStage(
                                hostname,
                                `Selector set was delivered to ${applyResult.frameCount} frame${applyResult.frameCount === 1 ? "" : "s"}.`,
                                "info",
                            );
                            await appendWallAssistTraceStage(
                                hostname,
                                `Matched ${applyResult.overlayMatchCount} overlay node${applyResult.overlayMatchCount === 1 ? "" : "s"} and ${applyResult.contentUnlockMatchCount} content node${applyResult.contentUnlockMatchCount === 1 ? "" : "s"}.`,
                                applyResult.overlayMatchCount > 0 || applyResult.contentUnlockMatchCount > 0 ? "info" : "error",
                            );
                            const hasUnlockTarget = Boolean(wallFixSelectors.contentUnlockSelector);
                            const hasOverlayMatches = applyResult.overlayMatchCount > 0;
                            const hasContentMatches = applyResult.contentUnlockMatchCount > 0;
                            const matchedNothing = !hasOverlayMatches && !hasContentMatches;
                            const matchedOnlyContent = !hasOverlayMatches && hasContentMatches;
                            const matchedOverlayOnly = hasOverlayMatches && !hasContentMatches;
                            const finalStatus = matchedNothing
                                ? "error"
                                : matchedOnlyContent || matchedOverlayOnly || !hasUnlockTarget
                                    ? "partial"
                                    : "success";
                            const finalSummary = matchedNothing
                                ? "AI returned selectors, but they did not match anything useful on the page."
                                : matchedOnlyContent
                                    ? "AI only matched a content container. The blocker itself was not found."
                                    : matchedOverlayOnly
                                        ? "AI matched a blocker candidate, but no content unlock target."
                                        : hasUnlockTarget
                                            ? `Wall-assist selectors were attempted across ${applyResult.frameCount} frame${applyResult.frameCount === 1 ? "" : "s"}.`
                                            : "A partial wall-assist selector set was attempted. Manual review is still needed.";
                            const finalStageLabel = matchedNothing
                                ? "Returned selectors did not match visible nodes on the page."
                                : matchedOnlyContent
                                    ? "Only content nodes matched; the blocker selector matched nothing."
                                    : matchedOverlayOnly
                                        ? "Only blocker candidates matched; no content unlock target matched."
                                        : hasUnlockTarget
                                            ? "Selectors were sent to the page scripts."
                                            : "A partial selector set was sent to the page scripts.";
                            const finalStageTone = matchedNothing
                                ? "error"
                                : matchedOnlyContent || matchedOverlayOnly || !hasUnlockTarget
                                    ? "info"
                                    : "success";
                            await completeWallAssistTrace(hostname, {
                                status: finalStatus,
                                pageUrl: target.pageUrl,
                                summary: finalSummary,
                                overlaySelector: wallFixSelectors.overlaySelector,
                                contentUnlockSelector: wallFixSelectors.contentUnlockSelector,
                                finalStageLabel,
                                finalStageTone,
                            });
                        }
                    } else {
                        await clearProcessingToast(tabId);
                        if (hostname) {
                            await completeWallAssistTrace(hostname, {
                                status: "no-result",
                                pageUrl: target.pageUrl,
                                summary: "AI returned no selectors for this page.",
                                finalStageLabel: "Run finished without a useful selector set.",
                                finalStageTone: "info",
                            });
                        }
                    }

                    return result;
                } catch (error) {
                    await sendContentMessageSafely(tabId, {
                        type: "SHOW_ERROR_TOAST",
                        message: getErrorMessage(error),
                    });
                    if (hostname) {
                        const errorMessage = getErrorMessage(error);
                        await completeWallAssistTrace(hostname, {
                            status: "error",
                            pageUrl: target.pageUrl,
                            summary: `Wall assist crashed: ${errorMessage}`,
                            lastError: errorMessage,
                            finalStageLabel: "Run crashed before a structured result returned.",
                            finalStageTone: "error",
                        });
                    }
                    throw error;
                }
            },

            HANDLE_COOKIE_CONSENT: async (message) => {
                try {
                    const aiModule = await deps.getAiModule();
                    const { tabId } = message.data;
                    const result = await aiModule.handleCookieConsent(tabId);
                    if (result.result?.selector) {
                        const frameCount = await broadcastToTabFrames(tabId, {
                            type: "EXECUTE_COOKIE_CONSENT_ACTION",
                            selector: result.result.selector,
                        });
                        console.info(`ZenithGuard: Broadcasted cookie-consent action to ${frameCount} frames.`);
                    }
                    return result;
                } catch (error) {
                    return mapAiError(error, "Cookie Consent");
                }
            },

            API_KEY_UPDATED: async () => {
                await (await deps.getAiModule()).resetAiClient();
                return { success: true };
            },

            SELF_HEAL_RULE: async (message, sender) => {
                if (!tabCanRunAiAction(sender)) {
                    return { error: TAB_CLOSED };
                }

                try {
                    return await (await deps.getAiModule()).handleSelfHealRule(
                        message.data.selector,
                        sender.tab.id,
                        message.data.pageUrl,
                    );
                } catch (error) {
                    return mapAiError(error, "Self-Heal");
                }
            },

            CLASSIFY_TEXT_LOCALLY: async (message) => {
                const result = await classifyTextWithGate(message.data.text, { enforceGate: true });
                return result || { isAdRelated: false, confidence: 0 };
            },
        },

        onTabRemoved(tabId) {
            clearAnalysisCooldown(tabId);
        },
    };
}

export async function summarizeNetworkLogWithGemini(
    getAiModule: () => Promise<AiModule>,
    networkLogs: NetworkLogEntry[],
    domain: string,
): Promise<string | null> {
    const blockedDomains = Array.from(new Set(
        networkLogs
            .filter((entry) => entry.status === "blocked")
            .map((entry) => getHostname(entry.url))
            .filter((hostname) => hostname.length > 0),
    )).slice(0, 30);

    if (blockedDomains.length === 0) {
        return "No third-party trackers or malicious network requests were detected on this page.";
    }

    try {
        const aiModule = await getAiModule();
        const result = await aiModule.handleGenerateNetworkSummary?.(networkLogs, domain);
        return result?.summary ?? null;
    } catch (error) {
        console.warn("ZenithGuard: Privacy Insights AI summary unavailable:", getErrorMessage(error));
        return null;
    }
}

export async function classifyTrackerDomainWithLocalAi(
    domain: string,
    text = `Domain: ${domain}`,
    options: { cacheTtlMs?: number; enforceGate?: boolean; minTextLength?: number } = {},
): Promise<LocalAiClassificationResult | null> {
    return classifyDomainWithCache(domain, text, {
        cacheTtlMs: options.cacheTtlMs ?? LOCAL_AI_CACHE_TTL_MS,
        enforceGate: options.enforceGate ?? false,
        minTextLength: options.minTextLength ?? 1,
    });
}

export function canUseLocalAiTrackerInsights(): boolean {
    return canUseLocalAiInsights();
}
