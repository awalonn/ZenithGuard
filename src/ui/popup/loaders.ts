import { getActiveTab } from "../../js/shared/browser";
import { findMatchingRecordEntry, hostnamesMatch } from "../../js/shared/hostname_matching";
import { normalizeCustomHidingRuleBuckets, normalizePersistentWallFixMap, normalizeTemporaryWallFixMap } from "../../js/shared/site_bucket_maps";
import { getNetworkLog, getPrivacyStats } from "../../js/shared/runtime_messages";
import { getLocal, getSync } from "../../js/shared/storage_api";
import { getWallAssistTraceMap, type WallAssistTrace } from "../../js/shared/wall_assist_trace";
import { getAiScanCacheKey } from "../../js/background/modules/privacy/formatting";
import type {
    PopupNetworkLog,
    PopupPrivacyStats,
    PopupSettingsSnapshot,
    PopupSnapshot,
    PopupStorageSnapshot,
    CosmeticCleanupSummary,
    TemporaryWallFix,
    ToolActivityEntry,
} from "./types";

type ToggleableRule = { value: string; enabled: boolean };
type PersistentWallFixState = { enabled?: boolean; [key: string]: unknown };

const EMPTY_SETTINGS: Required<PopupSettingsSnapshot> = {
    isProtectionEnabled: true,
    disabledSites: [],
    isolationModeSites: [],
    forgetfulSites: [],
    customHidingRules: {},
    persistentWallFixes: {},
    isFocusModeEnabled: false,
    focusModeUntil: 0,
    isBreachWarningEnabled: true,
};

function isWebTab(tab: chrome.tabs.Tab | null | undefined): boolean {
    if (!tab?.url) {
        return false;
    }

    try {
        const parsedUrl = new URL(tab.url);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

async function resolvePopupTargetTab(): Promise<chrome.tabs.Tab | null> {
    const activeTab = await getActiveTab();
    if (isWebTab(activeTab)) {
        return activeTab;
    }

    if (typeof chrome === "undefined" || !chrome.tabs?.query) {
        return activeTab;
    }

    try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return tabs
            .filter(isWebTab)
            .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0] ?? activeTab;
    } catch {
        return activeTab;
    }
}

function isEnabledForHostname(hostname: string, rules: ToggleableRule[] | undefined): boolean {
    if (!hostname || !Array.isArray(rules)) {
        return false;
    }

    return rules.some((rule) => {
        if (!rule?.value || rule.enabled === false) {
            return false;
        }

        return hostnamesMatch(hostname, rule.value);
    });
}

function sanitizeToolActivity(value: unknown): ToolActivityEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry): entry is ToolActivityEntry => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
            tool: String(entry.tool || "Tool"),
            title: String(entry.title || "Activity"),
            message: String(entry.message || ""),
            tone: entry.tone === "success" || entry.tone === "error" ? entry.tone : "info",
            timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
            domain: typeof entry.domain === "string" ? entry.domain : undefined,
        }));
}

function sanitizeTemporaryWallFixes(value: unknown): Record<string, TemporaryWallFix> {
    const normalized = normalizeTemporaryWallFixMap(
        value && typeof value === "object" ? value as Record<string, Record<string, unknown>> : {},
    );

    return Object.fromEntries(
        Object.entries(normalized).flatMap(([hostname, rawFix]) => {
            const overlaySelector = String(rawFix.overlaySelector || "").trim();
            if (!overlaySelector) {
                return [];
            }

            return [[hostname, {
                overlaySelector,
                scrollSelector: String(rawFix.scrollSelector || "").trim() || undefined,
                contentUnlockSelector: String(rawFix.contentUnlockSelector || "").trim() || undefined,
                reasoning: String(rawFix.reasoning || "").trim() || undefined,
            } as TemporaryWallFix]];
        }),
    );
}

function sanitizeCosmeticCleanupSummaries(value: unknown): Record<string, CosmeticCleanupSummary> {
    if (!value || typeof value !== "object") {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).flatMap(([hostname, rawSummary]) => {
            if (!rawSummary || typeof rawSummary !== "object") {
                return [];
            }

            const summary = rawSummary as Record<string, unknown>;
            const count = typeof summary.count === "number" && Number.isFinite(summary.count)
                ? Math.max(0, Math.floor(summary.count))
                : 0;
            const updatedAt = typeof summary.updatedAt === "number" && Number.isFinite(summary.updatedAt)
                ? summary.updatedAt
                : 0;

            if (!hostname || count <= 0 || updatedAt <= 0) {
                return [];
            }

            return [[hostname.toLowerCase(), {
                count,
                updatedAt,
                latestHint: typeof summary.latestHint === "string" && summary.latestHint.trim()
                    ? summary.latestHint.trim().slice(0, 160)
                    : undefined,
                pageUrl: typeof summary.pageUrl === "string" && summary.pageUrl.trim()
                    ? summary.pageUrl.trim().slice(0, 500)
                    : undefined,
            } as CosmeticCleanupSummary]];
        }),
    );
}

function getWallAssistTraceForHostname(
    entries: Record<string, WallAssistTrace> | undefined,
    hostname: string,
): WallAssistTrace | null {
    if (!entries || typeof entries !== "object") {
        return null;
    }

    for (const trace of Object.values(entries)) {
        if (hostnamesMatch(trace.domain, hostname)) {
            return trace;
        }
    }

    return null;
}

function sanitizeNetworkLog(value: unknown): PopupNetworkLog[] {
    const entries = Array.isArray(value)
        ? value
        : value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries)
            ? (value as { entries: unknown[] }).entries
            : [];

    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .filter((entry): entry is PopupNetworkLog => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
            id: typeof entry.id === "number" ? entry.id : 0,
            url: String(entry.url || ""),
            status: String(entry.status || "allowed"),
            type: typeof entry.type === "string" ? entry.type : undefined,
            timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
            matchedRuleInfo: entry.matchedRuleInfo && typeof entry.matchedRuleInfo === "object"
                ? {
                    source: typeof entry.matchedRuleInfo.source === "string" ? entry.matchedRuleInfo.source : undefined,
                    detail: typeof entry.matchedRuleInfo.detail === "string" ? entry.matchedRuleInfo.detail : undefined,
                    matchedValue: typeof entry.matchedRuleInfo.matchedValue === "string" ? entry.matchedRuleInfo.matchedValue : undefined,
                    category: typeof entry.matchedRuleInfo.category === "string" ? entry.matchedRuleInfo.category : undefined,
                }
                : undefined,
        }))
        .filter((entry) => Boolean(entry.url));
}

function sanitizePrivacyStats(value: unknown): PopupPrivacyStats {
    if (!isObjectLike(value)) {
        return { trackersDetected: 0, trackersBlocked: 0 };
    }

    const trackersFound = Array.isArray(value.trackersFound) ? value.trackersFound : [];
    const trackersDetected = typeof value.trackersDetected === "number"
        ? value.trackersDetected
        : trackersFound.length;

    return {
        ...value,
        trackersDetected,
        trackersBlocked: typeof value.trackersBlocked === "number"
            ? value.trackersBlocked
            : 0,
    };
}

function sanitizeSettings(snapshot: PopupSettingsSnapshot | undefined): Required<PopupSettingsSnapshot> {
    return {
        ...EMPTY_SETTINGS,
        ...snapshot,
        disabledSites: Array.isArray(snapshot?.disabledSites) ? snapshot.disabledSites : [],
        isolationModeSites: Array.isArray(snapshot?.isolationModeSites) ? snapshot.isolationModeSites : [],
        forgetfulSites: Array.isArray(snapshot?.forgetfulSites) ? snapshot.forgetfulSites : [],
        customHidingRules: Object.fromEntries(
            Object.entries(normalizeCustomHidingRuleBuckets(
                snapshot?.customHidingRules && typeof snapshot.customHidingRules === "object"
                    ? snapshot.customHidingRules as Record<string, Array<{ value: string; enabled?: boolean; lastHealed?: number; lastHealAttempt?: number }>>
                    : {},
            )).map(([domain, rules]) => [
                domain,
                rules.map((rule) => ({
                    value: rule.value,
                    enabled: rule.enabled !== false,
                })),
            ]),
        ),
        persistentWallFixes: normalizePersistentWallFixMap(
            snapshot?.persistentWallFixes && typeof snapshot.persistentWallFixes === "object"
                ? snapshot.persistentWallFixes as Record<string, PersistentWallFixState>
                : {},
        ),
        isFocusModeEnabled: Boolean(snapshot?.isFocusModeEnabled),
        focusModeUntil: typeof snapshot?.focusModeUntil === "number" ? snapshot.focusModeUntil : 0,
        isProtectionEnabled: snapshot?.isProtectionEnabled !== false,
        isBreachWarningEnabled: snapshot?.isBreachWarningEnabled !== false,
    };
}

async function buildStorageSnapshot(rawLocal: {
    toolActivityLog?: unknown;
    temporaryWallFixes?: unknown;
    cosmeticCleanupSummaryByHostname?: unknown;
    protectionPausedUntil?: number;
}): Promise<PopupStorageSnapshot> {
    const wallAssistTraceByHostname = await getWallAssistTraceMap().catch(() => ({}));

    return {
        toolActivityLog: sanitizeToolActivity(rawLocal.toolActivityLog),
        temporaryWallFixes: sanitizeTemporaryWallFixes(rawLocal.temporaryWallFixes),
        cosmeticCleanupSummaryByHostname: sanitizeCosmeticCleanupSummaries(rawLocal.cosmeticCleanupSummaryByHostname),
        wallAssistTraceByHostname,
        protectionPausedUntil: typeof rawLocal.protectionPausedUntil === "number"
            ? rawLocal.protectionPausedUntil
            : undefined,
    };
}

export async function loadPopupSnapshot(): Promise<PopupSnapshot> {
    const [activeTab, rawSettings, rawStorage] = await Promise.all([
        resolvePopupTargetTab(),
        getSync<PopupSettingsSnapshot>([
            "isProtectionEnabled",
            "disabledSites",
            "isolationModeSites",
            "forgetfulSites",
            "customHidingRules",
            "persistentWallFixes",
            "isFocusModeEnabled",
            "focusModeUntil",
            "isBreachWarningEnabled",
        ]),
        getLocal<{
            toolActivityLog?: unknown;
            temporaryWallFixes?: unknown;
            cosmeticCleanupSummaryByHostname?: unknown;
            protectionPausedUntil?: number;
        }>(["toolActivityLog", "temporaryWallFixes", "cosmeticCleanupSummaryByHostname", "protectionPausedUntil"]),
    ]);

    const settings = sanitizeSettings(rawSettings);
    const storage = await buildStorageSnapshot(rawStorage);

    const pageUrl = activeTab?.url || null;
    let hostname = "Loading...";
    let isExtensionPage = true;

    if (pageUrl) {
        try {
            hostname = new URL(pageUrl).hostname;
            isExtensionPage = false;
        } catch {
            hostname = "Extension Page";
            isExtensionPage = true;
        }
    }

    const tabId = typeof activeTab?.id === "number" ? activeTab.id : null;
    const hiddenRuleEntry = !isExtensionPage && hostname
        ? findMatchingRecordEntry(settings.customHidingRules, hostname)
        : null;
    const hiddenRules = hiddenRuleEntry?.value || [];

    const temporaryWallFixEntry = !isExtensionPage && hostname
        ? findMatchingRecordEntry(storage.temporaryWallFixes, hostname)
        : null;
    const savedWallFixEntry = !isExtensionPage && hostname
        ? findMatchingRecordEntry(settings.persistentWallFixes, hostname)
        : null;
    const temporaryWallFix = temporaryWallFixEntry?.value || null;
    const hasSavedWallFix = Boolean(savedWallFixEntry?.value?.enabled);
    const wallAssistTrace = !isExtensionPage && hostname
        ? getWallAssistTraceForHostname(storage.wallAssistTraceByHostname, hostname)
        : null;

    const [privacyStatsRaw, networkLogRaw, recentAiScanRaw] = await Promise.all([
        tabId ? getPrivacyStats(tabId).catch(() => ({ trackersDetected: 0, trackersBlocked: 0 })) : Promise.resolve({ trackersDetected: 0, trackersBlocked: 0 }),
        tabId
            ? getNetworkLog(tabId).catch(() => ({ entries: [], sessionStartedAt: null, lastUpdatedAt: null }))
            : Promise.resolve({ entries: [], sessionStartedAt: null, lastUpdatedAt: null }),
        !isExtensionPage && pageUrl
            ? getLocal<Record<string, unknown>>(getAiScanCacheKey(pageUrl)).catch(() => ({}))
            : Promise.resolve({}),
    ]);

    const privacyStats = sanitizePrivacyStats(privacyStatsRaw);
    const networkLog = sanitizeNetworkLog(networkLogRaw);
    const recentAiScanKey = !isExtensionPage && pageUrl ? getAiScanCacheKey(pageUrl) : "";
    const hasRecentAiScan = Boolean(recentAiScanKey && (recentAiScanRaw as Record<string, unknown>)[recentAiScanKey]);

    return {
        tabId,
        hostname,
        pageUrl,
        isExtensionPage,
        settings,
        storage,
        privacyStats,
        networkLog,
        hiddenRules,
        temporaryWallFix,
        wallAssistTrace,
        hasSavedWallFix,
        hasRecentAiScan,
    };
}

export function getIsSiteProtectionEnabled(snapshot: PopupSnapshot): boolean {
    if (snapshot.isExtensionPage) {
        return false;
    }

    return !snapshot.settings.disabledSites.some((value) => hostnamesMatch(value, snapshot.hostname));
}

export function getIsIsolationModeEnabled(snapshot: PopupSnapshot): boolean {
    return !snapshot.isExtensionPage && isEnabledForHostname(snapshot.hostname, snapshot.settings.isolationModeSites);
}

export function getIsForgetfulBrowsingEnabled(snapshot: PopupSnapshot): boolean {
    return !snapshot.isExtensionPage && isEnabledForHostname(snapshot.hostname, snapshot.settings.forgetfulSites);
}

export function getToolActivityForHostname(entries: ToolActivityEntry[], hostname: string): ToolActivityEntry[] {
    return entries.filter((entry) => typeof entry.domain === "string" && hostnamesMatch(entry.domain, hostname));
}
