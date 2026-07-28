import {
    MALWARE_CACHE_KEY,
    MALWARE_DATA_FIELD,
    MALWARE_SEED_PATH,
    MALWARE_SOURCE_LABEL,
    getEffectiveDefaultBlocklistEntries,
    getDefaultHeuristicKeywordEntries,
    normalizeDomain,
    normalizeDomainRuleEntries,
    normalizeHeuristicRuleEntries,
} from "../../js/background/modules/storage/defaults";
import { CORE_RULESET_ID, YOUTUBE_RULESET_ID } from "../../js/background/modules/network_logger/dnr_pipeline";
import { normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import { getLocal, getSession, getSync, removeLocal } from "../../js/shared/storage_api";
import { DEFAULT_SETTINGS } from "./config";
import type {
    CoreSettingId,
    CustomHidingRules,
    ExtensionHealthSnapshot,
    HidingRule,
    MalwareFeedStatus,
    NetworkBlocklistMeta,
    SettingsDashboardSnapshot,
    SettingsRuleSnapshot,
    SettingsSnapshot,
    ToggleableRule,
} from "./types";

const SETTINGS_KEYS: Array<CoreSettingId | "theme"> = [
    "isProtectionEnabled",
    "isNextGenAIEradicatorEnabled",
    "isYouTubeAdBlockingEnabled",
    "isHeuristicEngineEnabled",
    "isMalwareProtectionEnabled",
    "isUrlCleanerEnabled",
    "isCookieBannerHidingEnabled",
    "isBreachWarningEnabled",
    "isSandboxedIframeEnabled",
    "isPerformanceModeEnabled",
    "isSelfHealingEnabled",
    "theme",
];

const SETTINGS_SYNC_AI_KEYS = [
    "geminiModel",
    "geminiModelOverride",
] as const;

const RULE_SNAPSHOT_KEYS = [
    "defaultBlocklist",
    "networkBlocklist",
    "isolationModeSites",
    "forgetfulSites",
    "focusBlocklist",
    "heuristicKeywords",
    "customHidingRules",
    "persistentWallFixes",
    "disabledSites",
] as const;

const LOCAL_CACHE_KEYS = [MALWARE_CACHE_KEY, "networkBlocklistMeta"] as const;

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function toToggleableRule(value: unknown): ToggleableRule | HidingRule | null {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? { value: trimmed, enabled: true } : null;
    }

    if (!isObjectLike(value) || typeof value.value !== "string" || !value.value.trim()) {
        return null;
    }

    return {
        value: value.value.trim(),
        enabled: value.enabled !== false,
        ...(typeof value.lastHealed === "number" ? { lastHealed: value.lastHealed } : {}),
        ...(typeof value.lastHealAttempt === "number" ? { lastHealAttempt: value.lastHealAttempt } : {}),
    };
}

function toToggleableRuleArray(values: unknown): ToggleableRule[] {
    return Array.isArray(values)
        ? values.flatMap((value) => {
            const rule = toToggleableRule(value);
            return rule ? [{ value: rule.value, enabled: rule.enabled }] : [];
        })
        : [];
}

function normalizeStringList(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const normalized = new Set<string>();
    for (const value of values) {
        const hostname = normalizeDomain(String(value || ""));
        if (hostname) {
            normalized.add(hostname);
        }
    }

    return Array.from(normalized);
}

function normalizeDefaultBlocklist(values: unknown): ToggleableRule[] {
    return getEffectiveDefaultBlocklistEntries(values);
}

function normalizeCustomHidingRules(input: unknown): CustomHidingRules {
    if (!isObjectLike(input)) {
        return {};
    }

    const normalized: CustomHidingRules = {};
    for (const [domain, rules] of Object.entries(input)) {
        if (!Array.isArray(rules)) {
            continue;
        }

        const candidate = (normalizeDomain(domain) || domain.trim().toLowerCase()).toLowerCase();
        const normalizedDomain = candidate.startsWith("www.") ? candidate.slice(4) : candidate;
        if (!normalizedDomain) {
            continue;
        }

        const mapped = rules
            .map((rule) => toToggleableRule(rule))
            .filter((rule): rule is HidingRule => Boolean(rule));

        if (mapped.length > 0) {
            const merged = new Map<string, HidingRule>();
            for (const existing of normalized[normalizedDomain] || []) {
                merged.set(existing.value, existing);
            }

            for (const rule of mapped) {
                const current = merged.get(rule.value);
                merged.set(rule.value, {
                    ...rule,
                    enabled: Boolean((current?.enabled ?? false) || rule.enabled),
                    ...(typeof current?.lastHealed === "number" && (typeof rule.lastHealed !== "number" || current.lastHealed > rule.lastHealed)
                        ? { lastHealed: current.lastHealed }
                        : {}),
                    ...(typeof current?.lastHealAttempt === "number" && (typeof rule.lastHealAttempt !== "number" || current.lastHealAttempt > rule.lastHealAttempt)
                        ? { lastHealAttempt: current.lastHealAttempt }
                        : {}),
                });
            }

            normalized[normalizedDomain] = Array.from(merged.values());
        }
    }

    return normalized;
}

function normalizePersistentWallFixes(input: unknown): SettingsRuleSnapshot["persistentWallFixes"] {
    if (!isObjectLike(input)) {
        return {};
    }

    const normalized: SettingsRuleSnapshot["persistentWallFixes"] = {};
    for (const [domain, rawFix] of Object.entries(input)) {
        const candidate = (normalizeDomain(domain) || domain.trim().toLowerCase()).toLowerCase();
        const normalizedDomain = candidate.startsWith("www.") ? candidate.slice(4) : candidate;
        if (!normalizedDomain || !isObjectLike(rawFix)) {
            continue;
        }

        normalized[normalizedDomain] = normalized[normalizedDomain]
            ? {
                ...rawFix,
                ...normalized[normalizedDomain],
            }
            : rawFix;
    }

    return normalized;
}

function normalizeNetworkBlocklistMeta(input: unknown): NetworkBlocklistMeta {
    return normalizeNetworkBlocklistMetaRecord(input);
}

export async function loadSettingsSnapshot(): Promise<SettingsSnapshot> {
    const snapshot = await getSync<Partial<SettingsSnapshot>>(SETTINGS_KEYS);

    return {
        ...DEFAULT_SETTINGS,
        ...snapshot,
        theme: snapshot.theme === "light" ? "light" : "dark",
    };
}

export async function loadRulesSnapshot(): Promise<SettingsRuleSnapshot> {
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<Record<string, unknown>>(RULE_SNAPSHOT_KEYS),
        getLocal<Record<string, unknown>>(LOCAL_CACHE_KEYS),
    ]);

    return {
        defaultBlocklist: normalizeDefaultBlocklist(syncSnapshot.defaultBlocklist),
        networkBlocklist: normalizeDomainRuleEntries(toToggleableRuleArray(syncSnapshot.networkBlocklist)),
        networkBlocklistMeta: normalizeNetworkBlocklistMeta(localSnapshot.networkBlocklistMeta),
        isolationModeSites: normalizeDomainRuleEntries(toToggleableRuleArray(syncSnapshot.isolationModeSites)),
        forgetfulSites: normalizeDomainRuleEntries(toToggleableRuleArray(syncSnapshot.forgetfulSites)),
        focusBlocklist: normalizeStringList(syncSnapshot.focusBlocklist),
        heuristicKeywords: Array.isArray(syncSnapshot.heuristicKeywords) && syncSnapshot.heuristicKeywords.length > 0
            ? normalizeHeuristicRuleEntries(toToggleableRuleArray(syncSnapshot.heuristicKeywords))
            : getDefaultHeuristicKeywordEntries(),
        customHidingRules: normalizeCustomHidingRules(syncSnapshot.customHidingRules),
        persistentWallFixes: normalizePersistentWallFixes(syncSnapshot.persistentWallFixes),
        disabledSites: normalizeStringList(syncSnapshot.disabledSites),
    };
}

export async function loadMalwareFeedStatus(): Promise<MalwareFeedStatus> {
    const cache = await getLocal<Record<string, unknown>>(MALWARE_CACHE_KEY);
    const entry = isObjectLike(cache[MALWARE_CACHE_KEY]) ? cache[MALWARE_CACHE_KEY] : undefined;
    const domains = entry?.[MALWARE_DATA_FIELD];

    return {
        remoteSourceLabel: MALWARE_SOURCE_LABEL,
        bundledSeedPath: MALWARE_SEED_PATH,
        cachedDomains: Array.isArray(domains) ? domains.length : 0,
        lastUpdated: typeof entry?.lastUpdated === "number" ? Number(entry.lastUpdated) : null,
    };
}

function isToday(timestamp: number): boolean {
    const now = new Date();
    const date = new Date(timestamp);
    return now.getFullYear() === date.getFullYear()
        && now.getMonth() === date.getMonth()
        && now.getDate() === date.getDate();
}

export async function loadDashboardSnapshot(): Promise<SettingsDashboardSnapshot> {
    const [rulesSnapshot, localSnapshot] = await Promise.all([
        loadRulesSnapshot(),
        getLocal<{ toolActivityLog?: Array<{ timestamp?: number }> }>("toolActivityLog"),
    ]);

    const toolActivity = Array.isArray(localSnapshot.toolActivityLog)
        ? localSnapshot.toolActivityLog
        : [];

    return {
        toolActivityToday: toolActivity.filter((entry) => typeof entry?.timestamp === "number" && isToday(entry.timestamp)).length,
        customNetworkRules: rulesSnapshot.networkBlocklist.filter((rule) => rule.enabled !== false).length,
        enabledCoreRules: rulesSnapshot.defaultBlocklist.filter((rule) => rule.enabled !== false).length,
    };
}

function buildHealthIssues(snapshot: {
    settingsInitialized: boolean;
    protectionEnabled: boolean;
    staticCoreEnabled: boolean;
    youtubeRulesExpected: boolean;
    youtubeRulesEnabled: boolean;
    pausedUntil: number | null;
}): string[] {
    const issues: string[] = [];

    if (!snapshot.settingsInitialized) {
        issues.push("Settings have not finished first-run initialization.");
    }

    if (!snapshot.protectionEnabled) {
        issues.push("Global protection is off.");
    }

    if (snapshot.pausedUntil && snapshot.pausedUntil > Date.now()) {
        issues.push("Protection is temporarily paused.");
    }

    if (!snapshot.staticCoreEnabled) {
        issues.push("The core static ruleset is not enabled.");
    }

    if (snapshot.youtubeRulesExpected && !snapshot.youtubeRulesEnabled) {
        issues.push("The YouTube static ruleset is not enabled.");
    }

    return issues;
}

export async function loadExtensionHealthSnapshot(): Promise<ExtensionHealthSnapshot> {
    const [
        enabledRulesets,
        dynamicRules,
        syncSnapshot,
        localSnapshot,
        sessionSnapshot,
    ] = await Promise.all([
        chrome.declarativeNetRequest.getEnabledRulesets(),
        chrome.declarativeNetRequest.getDynamicRules(),
        getSync<{
            settingsInitialized?: boolean;
            isProtectionEnabled?: boolean;
            isYouTubeAdBlockingEnabled?: boolean;
            defaultBlocklist?: ToggleableRule[];
            disabledSites?: string[];
        }>([
            "settingsInitialized",
            "isProtectionEnabled",
            "isYouTubeAdBlockingEnabled",
            "defaultBlocklist",
            "disabledSites",
        ]),
        getLocal<{ protectionPausedUntil?: number }>("protectionPausedUntil"),
        getSession<{ sessionAllowlist?: string[] }>("sessionAllowlist"),
    ]);

    const manifest = chrome.runtime.getManifest();
    const pausedUntil = typeof localSnapshot.protectionPausedUntil === "number"
        ? localSnapshot.protectionPausedUntil
        : null;
    const youtubeRulesExpected = syncSnapshot.isProtectionEnabled !== false
        && syncSnapshot.isYouTubeAdBlockingEnabled !== false;
    const snapshot = {
        settingsInitialized: syncSnapshot.settingsInitialized === true,
        protectionEnabled: syncSnapshot.isProtectionEnabled !== false,
        staticCoreEnabled: enabledRulesets.includes(CORE_RULESET_ID),
        youtubeRulesExpected,
        youtubeRulesEnabled: enabledRulesets.includes(YOUTUBE_RULESET_ID),
        pausedUntil,
    };
    const issues = buildHealthIssues(snapshot);

    return {
        status: issues.length === 0 ? "ready" : "attention",
        statusLabel: issues.length === 0 ? "Ready" : "Needs Attention",
        issues,
        extensionId: chrome.runtime.id,
        manifestVersion: manifest.version,
        enabledRulesets,
        dynamicRuleCount: dynamicRules.length,
        staticCoreEnabled: snapshot.staticCoreEnabled,
        youtubeRulesEnabled: snapshot.youtubeRulesEnabled,
        youtubeRulesExpected,
        settingsInitialized: snapshot.settingsInitialized,
        protectionEnabled: snapshot.protectionEnabled,
        defaultOverrideCount: Array.isArray(syncSnapshot.defaultBlocklist) ? syncSnapshot.defaultBlocklist.length : 0,
        pausedUntil,
        sessionAllowlistCount: Array.isArray(sessionSnapshot.sessionAllowlist) ? sessionSnapshot.sessionAllowlist.length : 0,
        disabledSiteCount: Array.isArray(syncSnapshot.disabledSites) ? syncSnapshot.disabledSites.length : 0,
    };
}

export async function clearRecoveredCaches(): Promise<void> {
    await removeLocal([MALWARE_CACHE_KEY, "tracker-list-cache", "youtube-rules-cache"]);
}

export function shouldRefreshSettingsData(changes: Record<string, chrome.storage.StorageChange>, areaName: string): boolean {
    if (areaName === "sync") {
        return Object.keys(changes).some((key) =>
            SETTINGS_KEYS.includes(key as CoreSettingId | "theme")
            || SETTINGS_SYNC_AI_KEYS.includes(key as typeof SETTINGS_SYNC_AI_KEYS[number])
            || RULE_SNAPSHOT_KEYS.includes(key as typeof RULE_SNAPSHOT_KEYS[number]),
        );
    }

    if (areaName === "local") {
        return Boolean(changes[MALWARE_CACHE_KEY] || changes.networkBlocklistMeta || changes.toolActivityLog || changes.geminiApiKey);
    }

    return false;
}
