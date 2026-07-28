import {
    getDefaultBlocklistOverrides,
    getEffectiveDefaultBlocklistEntries,
    getDefaultHeuristicKeywordEntries,
    getInitialSettingsSnapshot,
    normalizeDomain,
    normalizeDomainRuleEntries,
    normalizeHeuristicRuleEntries,
} from "../../js/background/modules/storage/defaults";
import { normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import { addToNetworkBlocklist, classifyTextLocally, getNetworkLog, notifyApiKeyUpdated, sendMessage, sendMessageSafely } from "../../js/shared/runtime_messages";
import { getLocal, getSync, setLocal, setSync } from "../../js/shared/storage_api";
import { openAnalyzerPage, openLoggerPage } from "../../js/shared/browser";
import { applyThemeToDocument } from "./theme";
import { DEFAULT_SETTINGS } from "./config";
import type {
    ActiveTabDiagnosticsContext,
    CustomHidingRules,
    CoreSettingId,
    DiagnosticsNetworkSummary,
    DiagnosticsPreviewItem,
    ExtensionHealthSnapshot,
    LocalAiBlockActionState,
    LocalAiClassificationResult,
    NetworkBlocklistMeta,
    PersistentWallFixMap,
    SettingsDashboardSnapshot,
    SettingsSnapshot,
    ToggleableRule,
} from "./types";

const EXPORTABLE_SYNC_KEYS = [
    "theme",
    "geminiModel",
    "geminiModelOverride",
    ...Object.keys(getInitialSettingsSnapshot()),
    "focusBlocklist",
    "persistentWallFixes",
    "disabledSites",
    "isFocusModeEnabled",
    "focusModeUntil",
] as const;

const EXPORTABLE_LOCAL_KEYS = [
    "networkBlocklistMeta",
] as const;

const BACKUP_SCHEMA_VERSION = 1;

type ZenithGuardBackupFile = {
    format: "zenithguard-settings-backup";
    version: typeof BACKUP_SCHEMA_VERSION;
    exportedAt: string;
    sync: Record<string, unknown>;
    local?: {
        networkBlocklistMeta?: NetworkBlocklistMeta;
    };
};

type ZenithGuardBackupEnvelope = {
    format: "zenithguard-settings-backup";
    version?: unknown;
    exportedAt?: unknown;
    sync?: unknown;
    local?: unknown;
};

export type SettingsImportPreview = {
    message: string;
    items: string[];
    isLegacy: boolean;
};

type ParsedSettingsImport = {
    backup: ZenithGuardBackupFile | null;
    nextSync: Record<string, unknown>;
    nextLocal: ZenithGuardBackupFile["local"] | null;
};

type DiagnosticsTabCandidate = Pick<chrome.tabs.Tab, "active" | "id" | "lastAccessed" | "url" | "windowId">;

type DiagnosticsNetworkLogEntry = {
    status?: unknown;
    timestamp?: unknown;
};

function toDiagnosticsNetworkLogEntries(response: unknown): DiagnosticsNetworkLogEntry[] {
    const rawEntries = Array.isArray(response)
        ? response
        : isObjectLike(response) && Array.isArray(response.entries)
            ? response.entries
            : [];

    return rawEntries.flatMap((entry) => isObjectLike(entry) ? [{
        status: entry.status,
        timestamp: entry.timestamp,
    }] : []);
}

async function readBlobLikeText(value: Blob): Promise<string> {
    if (typeof (value as Blob & { text?: unknown }).text === "function") {
        return await (value as Blob & { text: () => Promise<string> }).text();
    }

    if (typeof (value as Blob & { arrayBuffer?: unknown }).arrayBuffer === "function") {
        const buffer = await (value as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
        return new TextDecoder().decode(buffer);
    }

    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => {
            reject(reader.error ?? new Error("Could not read the selected backup file."));
        };
        reader.readAsText(value);
    });
}

function normalizeStringList(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const normalized = new Set<string>();
    for (const value of values) {
        const hostname = normalizeDomain(String(value || ""));
        if (hostname) {
            normalized.add(hostname.startsWith("www.") ? hostname.slice(4) : hostname);
        }
    }

    return Array.from(normalized);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function normalizeSiteRuleEntries(values: unknown): ToggleableRule[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const byCanonical = new Map<string, ToggleableRule>();
    for (const rawRule of values) {
        const normalized = toToggleableRule(rawRule);
        if (!normalized) {
            continue;
        }

        const hostname = normalizeDomain(normalized.value);
        if (!hostname) {
            continue;
        }

        const canonical = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
        const current = byCanonical.get(canonical);
        byCanonical.set(canonical, {
            value: canonical,
            enabled: (current?.enabled !== false) || normalized.enabled !== false,
        });
    }

    return Array.from(byCanonical.values());
}

function normalizeImportedDomainRuleEntries(values: unknown): ToggleableRule[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return normalizeDomainRuleEntries(values
        .map((value) => toToggleableRule(value))
        .filter((value): value is ToggleableRule => Boolean(value)));
}

function normalizeImportedHeuristicRuleEntries(values: unknown): ToggleableRule[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return normalizeHeuristicRuleEntries(values
        .map((value) => toToggleableRule(value))
        .filter((value): value is ToggleableRule => Boolean(value)));
}

function toToggleableRule(value: unknown): ToggleableRule | null {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? { value: trimmed, enabled: true } : null;
    }

    if (isObjectLike(value) && typeof value.value === "string") {
        const trimmed = value.value.trim();
        if (!trimmed) {
            return null;
        }

        return {
            value: trimmed,
            enabled: value.enabled !== false,
        };
    }

    return null;
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

        const merged = new Map<string, CustomHidingRules[string][number]>();
        for (const rule of rules) {
            if (!isObjectLike(rule) || typeof rule.value !== "string") {
                continue;
            }

            const value = rule.value.trim();
            if (!value) {
                continue;
            }

            const current = merged.get(value);
            merged.set(value, {
                value,
                enabled: current?.enabled !== false || rule.enabled !== false,
                ...(typeof rule.lastHealed === "number"
                    ? { lastHealed: rule.lastHealed }
                    : typeof current?.lastHealed === "number"
                        ? { lastHealed: current.lastHealed }
                        : {}),
                ...(typeof rule.lastHealAttempt === "number"
                    ? { lastHealAttempt: rule.lastHealAttempt }
                    : typeof current?.lastHealAttempt === "number"
                        ? { lastHealAttempt: current.lastHealAttempt }
                        : {}),
            });
        }

        if (merged.size > 0) {
            normalized[normalizedDomain] = Array.from(merged.values());
        }
    }

    return normalized;
}

function normalizePersistentWallFixes(input: unknown): PersistentWallFixMap {
    if (!isObjectLike(input)) {
        return {};
    }

    const normalized: PersistentWallFixMap = {};
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

function buildExportableSyncSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
    const defaults = getInitialSettingsSnapshot();

    return {
        theme: snapshot.theme === "light" ? "light" : "dark",
        geminiModel: typeof snapshot.geminiModel === "string" ? snapshot.geminiModel : "",
        geminiModelOverride: typeof snapshot.geminiModelOverride === "string" ? snapshot.geminiModelOverride : "",
        isProtectionEnabled: snapshot.isProtectionEnabled !== false,
        isNextGenAIEradicatorEnabled: snapshot.isNextGenAIEradicatorEnabled !== false,
        isYouTubeAdBlockingEnabled: snapshot.isYouTubeAdBlockingEnabled !== false,
        isHeuristicEngineEnabled: snapshot.isHeuristicEngineEnabled !== false,
        isMalwareProtectionEnabled: snapshot.isMalwareProtectionEnabled !== false,
        isUrlCleanerEnabled: snapshot.isUrlCleanerEnabled !== false,
        isCookieBannerHidingEnabled: snapshot.isCookieBannerHidingEnabled === true,
        isBreachWarningEnabled: snapshot.isBreachWarningEnabled !== false,
        isSandboxedIframeEnabled: snapshot.isSandboxedIframeEnabled !== false,
        isPerformanceModeEnabled: snapshot.isPerformanceModeEnabled === true,
        isSelfHealingEnabled: snapshot.isSelfHealingEnabled === true,
        defaultBlocklist: getDefaultBlocklistOverrides(normalizeDefaultBlocklist(snapshot.defaultBlocklist)),
        networkBlocklist: normalizeImportedDomainRuleEntries(snapshot.networkBlocklist),
        isolationModeSites: normalizeSiteRuleEntries(snapshot.isolationModeSites),
        forgetfulSites: normalizeSiteRuleEntries(snapshot.forgetfulSites),
        focusBlocklist: normalizeStringList(snapshot.focusBlocklist),
        heuristicKeywords: Array.isArray(snapshot.heuristicKeywords) && snapshot.heuristicKeywords.length > 0
            ? normalizeImportedHeuristicRuleEntries(snapshot.heuristicKeywords)
            : getDefaultHeuristicKeywordEntries(),
        customHidingRules: normalizeCustomHidingRules(snapshot.customHidingRules),
        persistentWallFixes: normalizePersistentWallFixes(snapshot.persistentWallFixes),
        disabledSites: normalizeStringList(snapshot.disabledSites),
        isFocusModeEnabled: snapshot.isFocusModeEnabled === true,
        focusModeUntil: typeof snapshot.focusModeUntil === "number" ? snapshot.focusModeUntil : 0,
        settingsInitialized: snapshot.settingsInitialized !== false && defaults.settingsInitialized,
    };
}

function buildExportableLocalSnapshot(snapshot: Record<string, unknown>): ZenithGuardBackupFile["local"] {
    return {
        networkBlocklistMeta: normalizeNetworkBlocklistMetaRecord(snapshot.networkBlocklistMeta),
    };
}

function countCustomHidingRules(rules: unknown): number {
    if (!isObjectLike(rules)) {
        return 0;
    }

    return Object.values(rules)
        .reduce<number>((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0);
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

function buildSettingsImportPreview(parsed: ParsedSettingsImport): SettingsImportPreview {
    const metaCount = Object.keys(parsed.nextLocal?.networkBlocklistMeta || {}).length;
    const items = [
        formatCount(Array.isArray(parsed.nextSync.networkBlocklist) ? parsed.nextSync.networkBlocklist.length : 0, "custom network rule"),
        formatCount(Array.isArray(parsed.nextSync.heuristicKeywords) ? parsed.nextSync.heuristicKeywords.length : 0, "heuristic keyword"),
        formatCount(countCustomHidingRules(parsed.nextSync.customHidingRules), "custom hiding rule"),
        formatCount(Object.keys(parsed.nextSync.persistentWallFixes || {}).length, "wall fix", "wall fixes"),
        formatCount(Array.isArray(parsed.nextSync.disabledSites) ? parsed.nextSync.disabledSites.length : 0, "paused site"),
        formatCount(metaCount, "rule metadata record"),
    ];

    return {
        message: parsed.backup
            ? "Backup ready to import. Review the counts before replacing this browser profile's ZenithGuard settings."
            : "Legacy backup ready to import. Review the counts before replacing this browser profile's ZenithGuard settings.",
        items,
        isLegacy: !parsed.backup,
    };
}

function isBackupEnvelope(value: unknown): value is ZenithGuardBackupEnvelope {
    return isObjectLike(value) && value.format === "zenithguard-settings-backup";
}

function migrateBackupEnvelope(value: ZenithGuardBackupEnvelope): ZenithGuardBackupFile {
    if (!Number.isInteger(value.version)) {
        throw new Error("This ZenithGuard backup is missing a supported schema version.");
    }

    if (Number(value.version) > BACKUP_SCHEMA_VERSION) {
        throw new Error("This backup was created by a newer ZenithGuard version. Update ZenithGuard before importing it.");
    }

    if (Number(value.version) < 1) {
        throw new Error("This ZenithGuard backup uses an unsupported schema version.");
    }

    if (value.version !== BACKUP_SCHEMA_VERSION) {
        throw new Error("This ZenithGuard backup uses an unsupported schema version.");
    }

    if (!isObjectLike(value.sync)) {
        throw new Error("This backup file does not contain importable ZenithGuard settings.");
    }

    return {
        format: "zenithguard-settings-backup",
        version: BACKUP_SCHEMA_VERSION,
        exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
        sync: value.sync,
        local: isObjectLike(value.local)
            ? buildExportableLocalSnapshot(value.local)
        : undefined,
    };
}

async function parseSettingsImportFile(file: File): Promise<ParsedSettingsImport> {
    const rawText = await readBlobLikeText(file);
    let parsed: unknown;

    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error("This file is not valid JSON.");
    }

    const backup = isBackupEnvelope(parsed) ? migrateBackupEnvelope(parsed) : null;
    const syncPayload = backup
        ? backup.sync
        : isObjectLike(parsed)
            ? parsed
            : null;

    if (!syncPayload) {
        throw new Error("This backup file does not contain importable ZenithGuard settings.");
    }

    const nextSync = buildExportableSyncSnapshot(syncPayload);
    const nextLocal = backup
        ? buildExportableLocalSnapshot(backup.local || {})
        : null;

    return {
        backup,
        nextSync,
        nextLocal,
    };
}

export function applySettingsTheme(isDarkMode: boolean): void {
    applyThemeToDocument(isDarkMode);
}

export async function persistThemeMode(isDarkMode: boolean): Promise<void> {
    applySettingsTheme(isDarkMode);
    await setSync({ theme: isDarkMode ? "dark" : "light" });
}

export async function toggleCoreSetting(
    settings: SettingsSnapshot,
    settingId: CoreSettingId,
): Promise<SettingsSnapshot> {
    const nextSettings = {
        ...settings,
        [settingId]: !settings[settingId],
    };

    await setSync({ [settingId]: nextSettings[settingId] });
    return nextSettings;
}

export async function reEnableGlobalProtection(): Promise<string> {
    await sendMessage({ type: "TOGGLE_GLOBAL_PROTECTION", data: { isEnabled: true } });
    return "Protection re-enabled.";
}

export async function resumeProtection(): Promise<string> {
    await sendMessage({ type: "RESUME_PROTECTION" });
    return "Protection resumed.";
}

export async function saveGeminiApiKey(apiKey: string): Promise<void> {
    await setLocal({ geminiApiKey: apiKey.trim() });
    notifyApiKeyUpdated();
}

export async function saveGeminiModel(modelId: string): Promise<void> {
    await setSync({ geminiModel: modelId.trim() });
}

export async function saveGeminiModelOverride(modelId: string): Promise<void> {
    await setSync({ geminiModelOverride: modelId.trim() });
}

export async function exportSettingsSnapshot(): Promise<string> {
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<Record<string, unknown>>(EXPORTABLE_SYNC_KEYS),
        getLocal<Record<string, unknown>>(EXPORTABLE_LOCAL_KEYS),
    ]);

    const backup: ZenithGuardBackupFile = {
        format: "zenithguard-settings-backup",
        version: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        sync: buildExportableSyncSnapshot(syncSnapshot),
        local: buildExportableLocalSnapshot(localSnapshot),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: objectUrl,
        filename: "zenithguard_backup.json",
        saveAs: true,
    });

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return "Exported a ZenithGuard backup with your settings, rules, and rule metadata.";
}

export async function previewSettingsImport(file: File): Promise<SettingsImportPreview> {
    return buildSettingsImportPreview(await parseSettingsImportFile(file));
}

export async function importSettingsSnapshot(file: File): Promise<string> {
    const { backup, nextSync, nextLocal } = await parseSettingsImportFile(file);

    await setSync(nextSync);

    if (nextLocal) {
        await setLocal(nextLocal);
    }

    sendMessageSafely({ type: "APPLY_ALL_RULES" });
    sendMessageSafely({ type: "REAPPLY_HIDING_RULES" });

    return backup
        ? "Imported ZenithGuard backup."
        : "Imported legacy ZenithGuard settings backup.";
}

function getUnavailableActiveTabContext(unavailableReason: ActiveTabDiagnosticsContext["unavailableReason"]): ActiveTabDiagnosticsContext {
    return {
        source: "unavailable",
        tabId: null,
        windowId: null,
        origin: "",
        hostname: "",
        domain: "",
        protocol: "",
        redactedUrl: "",
        hasPath: false,
        hasQuery: false,
        hasHash: false,
        unavailableReason,
    };
}

function getUnavailableDiagnosticsNetworkSummary(unavailableReason: DiagnosticsNetworkSummary["unavailableReason"]): DiagnosticsNetworkSummary {
    return {
        source: "unavailable",
        totalEntries: 0,
        blockedEntries: 0,
        allowedEntries: 0,
        modifiedEntries: 0,
        sessionStartedAt: null,
        lastUpdatedAt: null,
        unavailableReason,
    };
}

function toCanonicalDomain(hostname: string): string {
    const normalized = hostname.toLowerCase();
    return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

export function buildActiveTabDiagnosticsContext(tab: DiagnosticsTabCandidate): ActiveTabDiagnosticsContext | null {
    if (!tab.url) {
        return null;
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(tab.url);
    } catch {
        return null;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return null;
    }

    const hasPath = parsedUrl.pathname !== "" && parsedUrl.pathname !== "/";

    return {
        source: "recent-web-tab",
        tabId: typeof tab.id === "number" ? tab.id : null,
        windowId: typeof tab.windowId === "number" ? tab.windowId : null,
        origin: parsedUrl.origin,
        hostname: parsedUrl.hostname.toLowerCase(),
        domain: toCanonicalDomain(parsedUrl.hostname),
        protocol: parsedUrl.protocol,
        redactedUrl: hasPath ? `${parsedUrl.origin}/[path]` : `${parsedUrl.origin}/`,
        hasPath,
        hasQuery: parsedUrl.search.length > 0,
        hasHash: parsedUrl.hash.length > 0,
    };
}

function selectRecentWebTabContext(tabs: DiagnosticsTabCandidate[]): ActiveTabDiagnosticsContext | null {
    return tabs
        .map((tab) => ({
            context: buildActiveTabDiagnosticsContext(tab),
            lastAccessed: typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0,
            active: tab.active === true,
        }))
        .filter((candidate): candidate is { context: ActiveTabDiagnosticsContext; lastAccessed: number; active: boolean } => Boolean(candidate.context))
        .sort((left, right) => {
            if (left.active !== right.active) {
                return left.active ? -1 : 1;
            }

            return right.lastAccessed - left.lastAccessed;
        })[0]?.context ?? null;
}

export async function loadActiveTabDiagnosticsContext(): Promise<ActiveTabDiagnosticsContext> {
    try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return selectRecentWebTabContext(tabs) ?? getUnavailableActiveTabContext("no-web-tab");
    } catch {
        return getUnavailableActiveTabContext("tabs-query-failed");
    }
}

export function buildDiagnosticsNetworkSummary(response: unknown): DiagnosticsNetworkSummary {
    const entries = toDiagnosticsNetworkLogEntries(response);
    const sessionStartedAt = isObjectLike(response) && typeof response.sessionStartedAt === "number"
        ? response.sessionStartedAt
        : null;
    const lastUpdatedAt = isObjectLike(response) && typeof response.lastUpdatedAt === "number"
        ? response.lastUpdatedAt
        : entries.reduce<number | null>((latest, entry) => {
            if (typeof entry.timestamp !== "number") {
                return latest;
            }

            return latest === null || entry.timestamp > latest ? entry.timestamp : latest;
        }, null);

    return {
        source: "tab-log",
        totalEntries: entries.length,
        blockedEntries: entries.filter((entry) => entry.status === "blocked").length,
        allowedEntries: entries.filter((entry) => entry.status === "allowed").length,
        modifiedEntries: entries.filter((entry) => entry.status === "modified").length,
        sessionStartedAt,
        lastUpdatedAt,
    };
}

export async function loadDiagnosticsNetworkSummary(context: ActiveTabDiagnosticsContext | null): Promise<DiagnosticsNetworkSummary> {
    if (context?.source !== "recent-web-tab" || typeof context.tabId !== "number") {
        return getUnavailableDiagnosticsNetworkSummary("no-web-tab");
    }

    try {
        return buildDiagnosticsNetworkSummary(await getNetworkLog(context.tabId));
    } catch {
        return getUnavailableDiagnosticsNetworkSummary("network-log-unavailable");
    }
}

export async function openDiagnosticsSiteLogger(context: ActiveTabDiagnosticsContext | null): Promise<string> {
    if (context?.source !== "recent-web-tab" || typeof context.tabId !== "number") {
        throw new Error("No diagnostics web tab is available for Logger.");
    }

    const search = context.domain || context.hostname;
    await openLoggerPage({
        tabId: context.tabId,
        search,
        status: "all",
    });

    return search ? `Opened Logger for ${search}.` : "Opened Logger for diagnostics site.";
}

export async function openDiagnosticsSiteAnalyzer(context: ActiveTabDiagnosticsContext | null): Promise<string> {
    if (context?.source !== "recent-web-tab" || typeof context.tabId !== "number") {
        throw new Error("No diagnostics web tab is available for Analyzer.");
    }

    const label = context.domain || context.hostname;
    await openAnalyzerPage(context.tabId);

    return label ? `Opened Analyzer for ${label}.` : "Opened Analyzer for diagnostics site.";
}

export function buildExtensionDiagnosticsReport(
    health: ExtensionHealthSnapshot,
    options: {
        activeTabContext?: ActiveTabDiagnosticsContext;
        dashboard?: SettingsDashboardSnapshot;
        generatedAt?: Date;
        networkSummary?: DiagnosticsNetworkSummary;
        userAgent?: string;
    } = {},
): string {
    const generatedAt = options.generatedAt ?? new Date();

    return JSON.stringify({
        format: "zenithguard-extension-diagnostics",
        version: 2,
        generatedAt: generatedAt.toISOString(),
        browser: {
            userAgent: options.userAgent || "",
        },
        pageContext: options.activeTabContext ?? getUnavailableActiveTabContext("no-web-tab"),
        runtime: {
            extensionId: health.extensionId,
            manifestVersion: health.manifestVersion,
            healthStatus: health.status,
            healthStatusLabel: health.statusLabel,
            enabledRulesets: health.enabledRulesets,
            dynamicRuleCount: health.dynamicRuleCount,
            staticCoreEnabled: health.staticCoreEnabled,
            youtubeRulesEnabled: health.youtubeRulesEnabled,
            youtubeRulesExpected: health.youtubeRulesExpected,
        },
        dashboard: options.dashboard
            ? {
                toolActivityToday: options.dashboard.toolActivityToday,
                customNetworkRules: options.dashboard.customNetworkRules,
                enabledCoreRules: options.dashboard.enabledCoreRules,
            }
            : {
                toolActivityToday: 0,
                customNetworkRules: 0,
                enabledCoreRules: 0,
            },
        protection: {
            settingsInitialized: health.settingsInitialized,
            protectionEnabled: health.protectionEnabled,
            pausedUntil: health.pausedUntil,
            sessionAllowlistCount: health.sessionAllowlistCount,
            disabledSiteCount: health.disabledSiteCount,
            defaultOverrideCount: health.defaultOverrideCount,
        },
        networkLog: options.networkSummary ?? getUnavailableDiagnosticsNetworkSummary("no-web-tab"),
        issues: health.issues,
    }, null, 2);
}

export function buildExtensionDiagnosticsPreview(
    health: ExtensionHealthSnapshot,
    activeTabContext: ActiveTabDiagnosticsContext | null,
    networkSummary?: DiagnosticsNetworkSummary | null,
    dashboard?: SettingsDashboardSnapshot | null,
): DiagnosticsPreviewItem[] {
    const context = activeTabContext ?? getUnavailableActiveTabContext("no-web-tab");
    const rulesetLabel = health.enabledRulesets.length > 0 ? health.enabledRulesets.join(", ") : "None";
    const siteLabel = context.source === "recent-web-tab"
        ? context.domain || context.hostname || "Unknown site"
        : "No web tab";
    const siteDetail = context.source === "recent-web-tab"
        ? context.redactedUrl || context.origin
        : "No current-window web tab is available.";
    const hiddenParts = [
        context.hasPath ? "path" : "",
        context.hasQuery ? "query" : "",
        context.hasHash ? "fragment" : "",
    ].filter(Boolean);
    const redactionDetail = context.source === "recent-web-tab"
        ? hiddenParts.length > 0
            ? `Hidden: ${hiddenParts.join(", ")}.`
            : "No path, query, or fragment present."
        : "No page URL will be included.";
    const networkLabel = networkSummary?.source === "tab-log"
        ? `${networkSummary.totalEntries} decision${networkSummary.totalEntries === 1 ? "" : "s"}`
        : "Unavailable";
    const networkDetail = networkSummary?.source === "tab-log"
        ? `${networkSummary.blockedEntries} blocked, ${networkSummary.allowedEntries} allowed, ${networkSummary.modifiedEntries} modified.`
        : "No diagnostics tab network log is available.";

    return [
        {
            label: "Health",
            value: health.statusLabel,
            detail: health.issues.length > 0 ? `${health.issues.length} issue${health.issues.length === 1 ? "" : "s"} included.` : "No health issues included.",
        },
        {
            label: "Site",
            value: siteLabel,
            detail: siteDetail,
        },
        {
            label: "Rulesets",
            value: rulesetLabel,
            detail: `${health.dynamicRuleCount} dynamic rule${health.dynamicRuleCount === 1 ? "" : "s"} included.`,
        },
        {
            label: "Dashboard",
            value: `${dashboard?.toolActivityToday ?? 0} activities today`,
            detail: `${dashboard?.customNetworkRules ?? 0} custom network rules, ${dashboard?.enabledCoreRules ?? 0} enabled core rules.`,
        },
        {
            label: "Protection",
            value: health.protectionEnabled ? "On" : "Off",
            detail: health.pausedUntil && health.pausedUntil > Date.now() ? "Pause timestamp included." : "No active pause included.",
        },
        {
            label: "Network Log",
            value: networkLabel,
            detail: networkDetail,
        },
        {
            label: "Redaction",
            value: "Private URL parts removed",
            detail: redactionDetail,
        },
    ];
}

export function downloadExtensionDiagnosticsReport(report: string): void {
    const blob = new Blob([report], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = "zenithguard_diagnostics.json";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function runLocalAiClassification(
    text: string,
    isAvailable: boolean,
): Promise<LocalAiClassificationResult> {
    if (!text.trim()) {
        return { error: "Enter some text to classify." };
    }

    if (!isAvailable) {
        return {
            error: "Local AI test is unavailable while AI Eradicator is off or Performance Mode is enabled.",
        };
    }

    try {
        return await classifyTextLocally(text);
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function detectDomainCandidate(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) {
        return null;
    }

    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>`]+/i);
    if (urlMatch?.[0]) {
        try {
            return new URL(urlMatch[0]).hostname;
        } catch {
            return null;
        }
    }

    const labeledMatch = trimmed.match(/\b(?:domain|host|url)\s*:\s*([^\s"'<>`]+)/i);
    if (labeledMatch?.[1]) {
        try {
            return new URL(`https://${labeledMatch[1].replace(/^https?:\/\//i, "")}`).hostname;
        } catch {
            return null;
        }
    }

    const hostMatch = trimmed.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>`]*)?/i);
    if (hostMatch?.[0]) {
        try {
            return new URL(`https://${hostMatch[0].split(/[/?#]/, 1)[0]}`).hostname;
        } catch {
            return null;
        }
    }

    return null;
}

export async function addLocalAiCandidateToBlocklist(domain: string): Promise<{ success: boolean; message: string }> {
    const normalized = detectDomainCandidate(domain);
    if (!normalized) {
        return {
            success: false,
            message: "No valid domain found to block.",
        };
    }

    const response = await addToNetworkBlocklist(normalized, "local-ai");

    if (response.success || response.message === "Rule already exists.") {
        return {
            success: true,
            message: response.message === "Rule already exists."
                ? `${normalized} is already in your custom blocklist.`
                : `${normalized} was added to your custom blocklist.`,
        };
    }

    return {
        success: false,
        message: response.message || "Could not add this domain to the custom blocklist.",
    };
}

export function isLocalAiTestAvailable(settings: SettingsSnapshot): boolean {
    return settings.isNextGenAIEradicatorEnabled && !settings.isPerformanceModeEnabled;
}

export function getInitialLocalAiBlockActionState(candidateDomain: string | null, result: LocalAiClassificationResult | null): LocalAiBlockActionState {
    return {
        candidateDomain,
        isEligible: Boolean(
            candidateDomain
            && result
            && "isAdRelated" in result
            && result.isAdRelated,
        ),
        isLoading: false,
        isAdded: false,
        message: !candidateDomain && result && !("error" in result)
            ? "No valid domain was detected in the text, so there is nothing to add to the blocklist here."
            : "",
    };
}

export function createDefaultSettingsSnapshot(): SettingsSnapshot {
    return { ...DEFAULT_SETTINGS };
}

export function getRuleValue(rule: string | ToggleableRule): string {
    return typeof rule === "string" ? rule : rule.value;
}

export function isRuleEnabled(rule: string | ToggleableRule): boolean {
    return typeof rule === "string" ? true : rule.enabled !== false;
}

export function getCustomRulesRegionId(domain: string): string {
    return `custom-rules-${domain.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function getPersistentWallFixRegionId(domain: string): string {
    return `wall-fix-${domain.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
