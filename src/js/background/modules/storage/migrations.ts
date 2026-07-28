import { getLocal, getSync, removeSync, setLocal, setSync, updateSync } from "../../../shared/storage_api";
import {
    DEFAULT_HEURISTIC_KEYWORDS,
    REMOVED_HEURISTIC_KEYWORDS,
    getDefaultBlocklistOverrides,
    getDefaultHeuristicKeywordEntries,
    getInitialSettingsSnapshot,
    normalizeDomain,
    normalizeDomainRuleEntries,
    normalizeHeuristicRuleEntries,
    type ToggleableRule,
} from "./defaults";

type RuleLike = string | ToggleableRule;

type CustomHidingRuleMap = Record<string, RuleLike[]>;
type PersistentWallFixMap = Record<string, { enabled?: boolean; overlaySelector?: string; scrollSelector?: string; contentUnlockSelector?: string }>;
type TemporaryWallFixMap = Record<string, { overlaySelector?: string; scrollSelector?: string; contentUnlockSelector?: string; reasoning?: string }>;
type NetworkBlocklistMeta = Record<string, { source?: string; addedAt?: number }>;
type WallAssistTraceMap = Record<string, {
    domain?: string;
    status?: string;
    summary?: string;
    startedAt?: number;
    updatedAt?: number;
    lastError?: string;
    overlaySelector?: string;
    contentUnlockSelector?: string;
    stages?: unknown[];
    pageUrl?: string;
}>;
type ToolActivityLogEntry = {
    tool?: string;
    title?: string;
    message?: string;
    tone?: string;
    timestamp?: number;
    domain?: string;
};

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isToggleableRuleArray(value: unknown): value is ToggleableRule[] {
    return Array.isArray(value)
        && value.every((item) => Boolean(item) && typeof item === "object" && typeof item.value === "string");
}

function toEnabledRules(values: string[]): ToggleableRule[] {
    return values.map((value) => ({ value, enabled: true }));
}

function normalizeStringArray(values: unknown): string[] {
    return Array.isArray(values)
        ? Array.from(new Set(
            values
                .map((value) => String(value || "").trim().toLowerCase())
                .filter(Boolean),
        ))
        : [];
}

function normalizeSiteBucketKey(value: string): string {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

function normalizeWwwAwareDomainRuleEntries(entries: ToggleableRule[]): ToggleableRule[] {
    const rulesByDomain = new Map<string, ToggleableRule>();
    for (const entry of entries || []) {
        const normalized = normalizeDomain(String(entry.value));
        if (!normalized) {
            continue;
        }

        const canonical = normalizeSiteBucketKey(normalized);
        const current = rulesByDomain.get(canonical);
        rulesByDomain.set(canonical, {
            value: canonical,
            enabled: (current?.enabled || false) || entry.enabled,
        });
    }

    return Array.from(rulesByDomain.values());
}

function mergeToggleableRules(
    current: ToggleableRule[] | undefined,
    incoming: RuleLike[],
): ToggleableRule[] {
    const merged = new Map<string, ToggleableRule>();

    for (const rule of current || []) {
        if (typeof rule?.value !== "string" || !rule.value.trim()) {
            continue;
        }
        merged.set(rule.value, { value: rule.value, enabled: rule.enabled !== false });
    }

    for (const rawRule of incoming) {
        const value = typeof rawRule === "string" ? rawRule : rawRule?.value;
        if (typeof value !== "string" || !value.trim()) {
            continue;
        }

        const existing = merged.get(value);
        const enabled = typeof rawRule === "string" ? true : rawRule.enabled !== false;
        merged.set(value, {
            value,
            enabled: Boolean((existing?.enabled ?? false) || enabled),
        });
    }

    return Array.from(merged.values());
}

function normalizeCustomHidingRuleBuckets(input: unknown): CustomHidingRuleMap {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: CustomHidingRuleMap = {};
    for (const [domain, rules] of Object.entries(input as Record<string, unknown>)) {
        const canonical = normalizeSiteBucketKey(domain);
        if (!canonical) {
            continue;
        }

        if (isStringArray(rules) || isToggleableRuleArray(rules)) {
            normalized[canonical] = mergeToggleableRules(normalized[canonical] as ToggleableRule[] | undefined, rules);
        }
    }

    return normalized;
}

function mergeObjectPreferExisting<T extends Record<string, unknown>>(current: T | undefined, incoming: T): T {
    if (!current) {
        return { ...incoming };
    }

    return {
        ...incoming,
        ...current,
    };
}

function normalizePersistentWallFixes(input: unknown): PersistentWallFixMap {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: PersistentWallFixMap = {};
    for (const [domain, rawFix] of Object.entries(input as Record<string, unknown>)) {
        const canonical = normalizeSiteBucketKey(domain);
        if (!canonical || !rawFix || typeof rawFix !== "object") {
            continue;
        }

        normalized[canonical] = mergeObjectPreferExisting(
            normalized[canonical],
            rawFix as PersistentWallFixMap[string],
        );
    }

    return normalized;
}

function normalizeTemporaryWallFixes(input: unknown): TemporaryWallFixMap {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: TemporaryWallFixMap = {};
    for (const [domain, rawFix] of Object.entries(input as Record<string, unknown>)) {
        const canonical = normalizeSiteBucketKey(domain);
        if (!canonical || !rawFix || typeof rawFix !== "object") {
            continue;
        }

        normalized[canonical] = mergeObjectPreferExisting(
            normalized[canonical],
            rawFix as TemporaryWallFixMap[string],
        );
    }

    return normalized;
}

function normalizeNetworkBlocklistMetaBuckets(input: unknown): NetworkBlocklistMeta {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: NetworkBlocklistMeta = {};
    for (const [domain, rawMeta] of Object.entries(input as Record<string, unknown>)) {
        const canonical = normalizeSiteBucketKey(domain);
        if (!canonical || !rawMeta || typeof rawMeta !== "object") {
            continue;
        }

        const current = normalized[canonical];
        const incoming = rawMeta as NetworkBlocklistMeta[string];
        const currentAddedAt = typeof current?.addedAt === "number" ? current.addedAt : -1;
        const incomingAddedAt = typeof incoming?.addedAt === "number" ? incoming.addedAt : -1;
        normalized[canonical] = incomingAddedAt > currentAddedAt
            ? { ...incoming }
            : current || { ...incoming };
    }

    return normalized;
}

function normalizeWallAssistTraceBuckets(input: unknown): WallAssistTraceMap {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: WallAssistTraceMap = {};
    for (const [domain, rawTrace] of Object.entries(input as Record<string, unknown>)) {
        const canonical = normalizeSiteBucketKey(domain);
        if (!canonical || !rawTrace || typeof rawTrace !== "object") {
            continue;
        }

        const current = normalized[canonical];
        const incoming = rawTrace as WallAssistTraceMap[string];
        const currentUpdatedAt = typeof current?.updatedAt === "number" ? current.updatedAt : -1;
        const incomingUpdatedAt = typeof incoming?.updatedAt === "number" ? incoming.updatedAt : -1;

        normalized[canonical] = incomingUpdatedAt >= currentUpdatedAt
            ? { ...incoming, domain: canonical }
            : current || { ...incoming, domain: canonical };
    }

    return normalized;
}

function normalizeToolActivityLog(input: unknown): ToolActivityLogEntry[] {
    if (!Array.isArray(input)) {
        return [];
    }

    return input
        .filter((entry): entry is ToolActivityLogEntry => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
            ...entry,
            domain: typeof entry.domain === "string" ? normalizeSiteBucketKey(entry.domain) : entry.domain,
        }));
}

function normalizeCustomHidingRules(input: unknown): CustomHidingRuleMap {
    return normalizeCustomHidingRuleBuckets(input);
}

async function migrateGeminiApiKey(): Promise<void> {
    const [{ geminiApiKey: localApiKey }, { geminiApiKey: syncApiKey }] = await Promise.all([
        getLocal<{ geminiApiKey?: string }>("geminiApiKey"),
        getSync<{ geminiApiKey?: string }>("geminiApiKey"),
    ]);

    const normalizedLocalKey = typeof localApiKey === "string" ? localApiKey.trim() : "";
    const normalizedSyncKey = typeof syncApiKey === "string" ? syncApiKey.trim() : "";
    if (!normalizedLocalKey && normalizedSyncKey) {
        await setLocal({ geminiApiKey: normalizedSyncKey });
    }

    if (syncApiKey !== undefined) {
        await removeSync("geminiApiKey");
    }
}

async function migrateLegacyHostnameBuckets(): Promise<void> {
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{
            customHidingRules?: unknown;
            persistentWallFixes?: unknown;
            disabledSites?: unknown;
            focusBlocklist?: unknown;
        }>(["customHidingRules", "persistentWallFixes", "disabledSites", "focusBlocklist"]),
        getLocal<{
            temporaryWallFixes?: unknown;
            networkBlocklistMeta?: unknown;
            wallAssistTraceByHostname?: unknown;
            toolActivityLog?: unknown;
        }>(["temporaryWallFixes", "networkBlocklistMeta", "wallAssistTraceByHostname", "toolActivityLog"]),
    ]);

    const syncUpdates: Record<string, unknown> = {};
    const localUpdates: Record<string, unknown> = {};

    const normalizedCustomHidingRules = normalizeCustomHidingRuleBuckets(syncSnapshot.customHidingRules);
    if (JSON.stringify(normalizedCustomHidingRules) !== JSON.stringify(syncSnapshot.customHidingRules || {})) {
        syncUpdates.customHidingRules = normalizedCustomHidingRules;
    }

    const normalizedPersistentWallFixes = normalizePersistentWallFixes(syncSnapshot.persistentWallFixes);
    if (JSON.stringify(normalizedPersistentWallFixes) !== JSON.stringify(syncSnapshot.persistentWallFixes || {})) {
        syncUpdates.persistentWallFixes = normalizedPersistentWallFixes;
    }

    const normalizedDisabledSites = normalizeStringArray(syncSnapshot.disabledSites).map(normalizeSiteBucketKey);
    if (normalizedDisabledSites.length > 0 && JSON.stringify(normalizedDisabledSites) !== JSON.stringify(syncSnapshot.disabledSites)) {
        syncUpdates.disabledSites = Array.from(new Set(normalizedDisabledSites));
    }

    const normalizedFocusBlocklist = normalizeStringArray(syncSnapshot.focusBlocklist).map(normalizeSiteBucketKey);
    if (normalizedFocusBlocklist.length > 0 && JSON.stringify(normalizedFocusBlocklist) !== JSON.stringify(syncSnapshot.focusBlocklist)) {
        syncUpdates.focusBlocklist = Array.from(new Set(normalizedFocusBlocklist));
    }

    const normalizedTemporaryWallFixes = normalizeTemporaryWallFixes(localSnapshot.temporaryWallFixes);
    if (JSON.stringify(normalizedTemporaryWallFixes) !== JSON.stringify(localSnapshot.temporaryWallFixes || {})) {
        localUpdates.temporaryWallFixes = normalizedTemporaryWallFixes;
    }

    const normalizedNetworkBlocklistMeta = normalizeNetworkBlocklistMetaBuckets(localSnapshot.networkBlocklistMeta);
    if (JSON.stringify(normalizedNetworkBlocklistMeta) !== JSON.stringify(localSnapshot.networkBlocklistMeta || {})) {
        localUpdates.networkBlocklistMeta = normalizedNetworkBlocklistMeta;
    }

    const normalizedWallAssistTraceByHostname = normalizeWallAssistTraceBuckets(localSnapshot.wallAssistTraceByHostname);
    if (JSON.stringify(normalizedWallAssistTraceByHostname) !== JSON.stringify(localSnapshot.wallAssistTraceByHostname || {})) {
        localUpdates.wallAssistTraceByHostname = normalizedWallAssistTraceByHostname;
    }

    const normalizedToolActivityLog = normalizeToolActivityLog(localSnapshot.toolActivityLog);
    if (JSON.stringify(normalizedToolActivityLog) !== JSON.stringify(localSnapshot.toolActivityLog || [])) {
        localUpdates.toolActivityLog = normalizedToolActivityLog;
    }

    await Promise.all([
        Object.keys(syncUpdates).length > 0 ? updateSync(syncUpdates) : Promise.resolve(),
        Object.keys(localUpdates).length > 0 ? setLocal(localUpdates) : Promise.resolve(),
    ]);
}

export async function initializeSettings(): Promise<void> {
    await migrateGeminiApiKey();
    await migrateLegacyHostnameBuckets();

    const defaults = getInitialSettingsSnapshot();
    const { settingsInitialized, autoAiDisabledOnce, defaultBlocklist } = await getSync<{
        settingsInitialized?: boolean;
        autoAiDisabledOnce?: boolean;
        defaultBlocklist?: ToggleableRule[];
    }>(["settingsInitialized", "autoAiDisabledOnce", "defaultBlocklist"]);

    if (!autoAiDisabledOnce) {
        console.info("ZenithGuard: Temporarily disabling automatic AI features to restore Gemini quota.");
        await updateSync({
            isCookieBannerHidingEnabled: false,
            isSelfHealingEnabled: false,
            autoAiDisabledOnce: true,
        });
    }

    if (settingsInitialized) {
        const partialDefaults = getInitialSettingsSnapshot();
        const currentSettings = await getSync<Record<string, unknown>>(Object.keys(partialDefaults));
        const missingDefaults: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(partialDefaults)) {
            if (currentSettings[key] === undefined) {
                missingDefaults[key] = value;
            }
        }

        if (Object.keys(missingDefaults).length > 0) {
            console.info("ZenithGuard: Filling in missing default settings for legacy user.");
            await updateSync(missingDefaults);
        }

        if (Array.isArray(defaultBlocklist)) {
            const compactBlocklist = getDefaultBlocklistOverrides(defaultBlocklist);
            if (JSON.stringify(compactBlocklist) !== JSON.stringify(defaultBlocklist)) {
                console.info("ZenithGuard: Compacting built-in default blocklist overrides for sync storage.");
                await updateSync({ defaultBlocklist: compactBlocklist });
            }
        }

        return;
    }

    const existingSettings = await getSync<Record<string, unknown>>(Object.keys(defaults));
    const hasLegacyState = Object.keys(defaults)
        .filter((key) => key !== "settingsInitialized")
        .some((key) => existingSettings[key] !== undefined);

    if (hasLegacyState) {
        console.info("ZenithGuard: Legacy settings detected without settingsInitialized flag. Repairing defaults without overwriting user state.");

        const missingDefaults: Record<string, unknown> = { settingsInitialized: true };
        for (const [key, value] of Object.entries(defaults)) {
            if (existingSettings[key] === undefined) {
                missingDefaults[key] = value;
            }
        }

        await updateSync(missingDefaults);
        return;
    }

    console.info("ZenithGuard: First run or settings missing. Initializing default settings.");
    await setSync(defaults);
}

export async function migrateStoredRules(): Promise<void> {
    const ruleKeys = [
        "networkBlocklist",
        "heuristicKeywords",
        "heuristicAllowlist",
        "isolationModeSites",
        "forgetfulSites",
        "defaultBlocklist",
    ] as const;

    const snapshot = await getSync<Record<string, unknown>>(ruleKeys);
    const updates: Record<string, unknown> = {};

    for (const key of ruleKeys) {
        const value = snapshot[key];
        if (isStringArray(value)) {
            console.info(`ZenithGuard: Migrating old rule format for "${key}".`);
            updates[key] = toEnabledRules(value);
        }
    }

    const { customHidingRules = {} } = await getSync<{ customHidingRules?: unknown }>("customHidingRules");
    const normalizedHidingRules = normalizeCustomHidingRules(customHidingRules);
    if (JSON.stringify(normalizedHidingRules) !== JSON.stringify(customHidingRules || {})) {
        updates.customHidingRules = normalizedHidingRules;
    }

    const ruleEntryKeys = [
        "networkBlocklist",
        "heuristicAllowlist",
        "isolationModeSites",
        "forgetfulSites",
    ] as const;

    const normalizedRuleEntries = await getSync<Record<string, unknown>>(ruleEntryKeys);
    for (const key of ruleEntryKeys) {
        const value = updates[key] ?? normalizedRuleEntries[key];
        if (isToggleableRuleArray(value)) {
            const normalized = normalizeWwwAwareDomainRuleEntries(normalizeDomainRuleEntries(value));
            if (JSON.stringify(normalized) !== JSON.stringify(value)) {
                updates[key] = normalized;
            }
        }
    }

    const stringListKeys = ["disabledSites", "focusBlocklist"] as const;
    const normalizedStrings = await getSync<Record<string, unknown>>(stringListKeys);
    for (const key of stringListKeys) {
        const value = normalizedStrings[key];
        const normalized = normalizeStringArray(value);
        if (normalized.length > 0 && JSON.stringify(normalized) !== JSON.stringify(value)) {
            updates[key] = normalized;
        }
    }

    const { heuristicKeywords = [] } = await getSync<{ heuristicKeywords?: ToggleableRule[] }>("heuristicKeywords");
    if (isToggleableRuleArray(heuristicKeywords)) {
        let mergedKeywords = normalizeHeuristicRuleEntries(heuristicKeywords);
        const presentKeywords = new Set(mergedKeywords.map((rule) => rule.value));

        for (const keyword of DEFAULT_HEURISTIC_KEYWORDS) {
            if (!presentKeywords.has(keyword)) {
                console.info(`ZenithGuard: Adding new heuristic keyword: ${keyword}`);
                mergedKeywords.push({ value: keyword, enabled: true });
                presentKeywords.add(keyword);
            }
        }

        const removedKeywords = new Set(REMOVED_HEURISTIC_KEYWORDS);
        mergedKeywords = mergedKeywords.filter((rule) => !removedKeywords.has(rule.value));

        if (JSON.stringify(mergedKeywords) !== JSON.stringify(heuristicKeywords)) {
            updates.heuristicKeywords = mergedKeywords;
        }
    }

    const { defaultBlocklist = [] } = await getSync<{ defaultBlocklist?: ToggleableRule[] }>("defaultBlocklist");
    const defaultBlocklistCandidate = updates.defaultBlocklist ?? defaultBlocklist;
    if (isToggleableRuleArray(defaultBlocklistCandidate)) {
        const compactBlocklist = getDefaultBlocklistOverrides(defaultBlocklistCandidate);
        if (JSON.stringify(compactBlocklist) !== JSON.stringify(defaultBlocklistCandidate)) {
            updates.defaultBlocklist = compactBlocklist;
        }
    }

    if (Object.keys(updates).length > 0) {
        await updateSync(updates);
        console.info("ZenithGuard: Rule migration complete.");
    }
}
