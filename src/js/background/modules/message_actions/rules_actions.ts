import type { ContentMessage } from "../../../shared/content_messages";
import { sendContentMessageSafely } from "../../../shared/runtime_messages";
import { findMatchingRecordEntry, hostnamesMatch, listHasMatchingHostname } from "../../../shared/hostname_matching";
import { normalizeNetworkBlocklistMetaRecord } from "../../../shared/network_blocklist_meta";
import type { NetworkBlocklistSource } from "../../../shared/runtime_messages";
import {
    getLocal,
    getSession,
    getSync,
    removeLocal,
    removeSession,
    setLocal,
    setSession,
    setSync,
} from "../../../shared/storage_api";
import {
    getDefaultHeuristicKeywordEntries,
    getNetworkRuleValidationMessage,
    getInitialSettingsSnapshot,
    normalizeDomain,
    startFocusMode,
    stopFocusMode,
    type ToggleableRule,
    validateNetworkRuleValue,
} from "../storage/defaults";

const APPLY_RULES_DEBOUNCE_MS = 500;
const PAUSE_PROTECTION_DURATION_MS = 15 * 60 * 1000;
const FOCUS_MODE_END_ALARM = "focusModeEnd";

type NetworkBlockMeta = {
    source: NetworkBlocklistSource;
    addedAt: number;
};

type BulkAddRulesPayload = {
    networkBlocklist: string[];
    customHidingRules: {
        domain: string;
        selectors: string[];
    };
};

type RulesActionDeps = {
    applyRules: () => Promise<void>;
    broadcastToAllTabs?: (message: ContentMessage) => Promise<void>;
};

type RulesActionRegistry = {
    actions: {
        TOGGLE_GLOBAL_PROTECTION: (message: { data: { isEnabled: boolean } }) => Promise<{ success: true }>;
        APPLY_RULES_AND_RELOAD_TAB: (message: { data?: { tabId?: number } }) => Promise<{ success: true }>;
        APPLY_ALL_RULES: () => Promise<{ success: true }>;
        ADD_TO_NETWORK_BLOCKLIST: (message: { domain: string; source?: NetworkBlocklistSource }) => Promise<{ success: boolean; message?: string }>;
        BULK_ADD_RULES: (message: { data: BulkAddRulesPayload }) => Promise<{ success: true }>;
        TEMPORARILY_ALLOW_DOMAIN: (message: { domain: string }) => Promise<{ success: true }>;
        PAUSE_PROTECTION: () => Promise<{ success: true; pauseUntil: number }>;
        RESUME_PROTECTION: () => Promise<{ success: true }>;
        START_FOCUS_MODE: (message: { duration: number }) => Promise<{ success: true }>;
        STOP_FOCUS_MODE: () => Promise<{ success: true }>;
        RESET_SETTINGS_TO_DEFAULTS: () => Promise<{ success: true }>;
        REAPPLY_HIDING_RULES: () => Promise<{ success: true }>;
    };
};

function coerceRuleValue(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }

    if (value && typeof value === "object" && "value" in value) {
        const nestedValue = (value as { value?: unknown }).value;
        if (typeof nestedValue === "string" && nestedValue.trim()) {
            return nestedValue.trim();
        }
    }

    return null;
}

function toEnabledRules(values: Iterable<string>): ToggleableRule[] {
    return Array.from(values).map((value) => ({ value, enabled: true }));
}

async function reloadWebTabs(): Promise<void> {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        try {
            if (typeof tab.id === "number") {
                await chrome.tabs.reload(tab.id);
            }
        } catch {
            // Ignore transient tab reload failures.
        }
    }
}

function mergeNetworkRules(existingRules: unknown[] | undefined, additions: string[]): ToggleableRule[] {
    const merged = new Map<string, ToggleableRule>();

    for (const rule of existingRules || []) {
        const rawValue = coerceRuleValue(rule);
        const normalized = rawValue ? normalizeDomain(rawValue) : null;
        if (!normalized) {
            continue;
        }

        const enabled = Boolean(rule && typeof rule === "object" && "enabled" in rule ? (rule as { enabled?: unknown }).enabled : true);
        const current = merged.get(normalized);
        merged.set(normalized, {
            value: normalized,
            enabled: Boolean((current?.enabled || false) || enabled),
        });
    }

    for (const value of additions) {
        const normalized = normalizeDomain(String(value));
        if (!normalized) {
            continue;
        }

        const existingKey = Array.from(merged.keys()).find((candidate) => hostnamesMatch(candidate, normalized));
        if (existingKey) {
            const current = merged.get(existingKey);
            merged.set(existingKey, {
                ...(current || {}),
                value: existingKey,
                enabled: true,
            });
            continue;
        }

        merged.set(normalized, { value: normalized, enabled: true });
    }

    return Array.from(merged.values());
}

function mergeCustomHidingRules(
    existingRules: Record<string, unknown> | undefined,
    domain: string,
    selectors: string[],
): Record<string, ToggleableRule[]> {
    const merged = { ...(existingRules || {}) } as Record<string, ToggleableRule[]>;
    const normalizedDomain = String(domain || "").trim();
    if (!normalizedDomain || selectors.length === 0) {
        return merged;
    }

    const matchingEntry = findMatchingRecordEntry(merged, normalizedDomain);
    const bucketKey = matchingEntry?.key || normalizedDomain;

    const uniqueSelectors = new Set<string>();
    for (const selector of merged[bucketKey] || []) {
        const value = coerceRuleValue(selector);
        if (value) {
            uniqueSelectors.add(value);
        }
    }
    for (const selector of selectors) {
        const value = String(selector || "").trim();
        if (value) {
            uniqueSelectors.add(value);
        }
    }

    merged[bucketKey] = toEnabledRules(uniqueSelectors);
    return merged;
}

function createDebouncedApplyRules(applyRules: () => Promise<void>, delayMs = APPLY_RULES_DEBOUNCE_MS): () => Promise<void> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    return async () => new Promise((resolve) => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        timeoutHandle = setTimeout(async () => {
            await applyRules();
            resolve();
        }, delayMs);
    });
}

async function resetRuleSettingsToDefaults(): Promise<void> {
    const initialSnapshot = getInitialSettingsSnapshot();
    await Promise.all([
        setSync({
            ...initialSnapshot,
            defaultBlocklist: [],
            heuristicKeywords: getDefaultHeuristicKeywordEntries(),
            networkBlocklist: initialSnapshot.networkBlocklist,
            customHidingRules: initialSnapshot.customHidingRules,
            heuristicAllowlist: initialSnapshot.heuristicAllowlist,
            isolationModeSites: initialSnapshot.isolationModeSites,
            forgetfulSites: initialSnapshot.forgetfulSites,
            disabledSites: [],
            focusBlocklist: [],
            persistentWallFixes: {},
            isFocusModeEnabled: false,
            focusModeUntil: 0,
        }),
        removeLocal(["networkBlocklistMeta", "temporaryWallFixes", "protectionPausedUntil"]),
        removeSession("sessionAllowlist"),
        chrome.alarms.clear("resumeProtection"),
        chrome.alarms.clear(FOCUS_MODE_END_ALARM),
    ]);
}

async function reapplyHidingRules(broadcastToAllTabs?: (message: ContentMessage) => Promise<void>): Promise<void> {
    if (broadcastToAllTabs) {
        await broadcastToAllTabs({ type: "REAPPLY_HIDING_RULES" });
        return;
    }

    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: "complete" });
    await Promise.allSettled(
        tabs.map((tab) => {
            if (typeof tab.id !== "number") {
                return Promise.resolve();
            }
            return sendContentMessageSafely(tab.id, { type: "REAPPLY_HIDING_RULES" });
        }),
    );
}

export function createRulesActionRegistry(deps: RulesActionDeps): RulesActionRegistry {
    const applyRulesDebounced = createDebouncedApplyRules(deps.applyRules);
    const applyRulesAndReapplyHiding = async (): Promise<void> => {
        await deps.applyRules();
        await reapplyHidingRules(deps.broadcastToAllTabs);
    };

    return {
        actions: {
            TOGGLE_GLOBAL_PROTECTION: async (message) => {
                await setSync({ isProtectionEnabled: message.data.isEnabled });
                await deps.applyRules();
                await reloadWebTabs();
                return { success: true };
            },

            APPLY_RULES_AND_RELOAD_TAB: async (message) => {
                await applyRulesDebounced();
                try {
                    if (typeof message.data?.tabId === "number") {
                        await chrome.tabs.reload(message.data.tabId);
                    }
                } catch {
                    // Ignore reload failures for closed or protected tabs.
                }
                return { success: true };
            },

            APPLY_ALL_RULES: async () => {
                await applyRulesDebounced();
                return { success: true };
            },

            ADD_TO_NETWORK_BLOCKLIST: async (message) => {
                const validation = validateNetworkRuleValue(message.domain);
                if (!validation.normalizedValue) {
                    return {
                        success: false,
                        message: getNetworkRuleValidationMessage(validation.reason),
                    };
                }

                const normalizedDomain = validation.normalizedValue;
                const { networkBlocklist = [] } = await getSync<{ networkBlocklist?: ToggleableRule[] }>("networkBlocklist");
                const existingRule = networkBlocklist.find((rule) => hostnamesMatch(rule.value, normalizedDomain));
                if (existingRule && existingRule.enabled !== false) {
                    return { success: false, message: "Rule already exists." };
                }
                const mergedBlocklist = mergeNetworkRules(networkBlocklist, [normalizedDomain]);

                await setSync({ networkBlocklist: mergedBlocklist });

                if (message.source) {
                    const { networkBlocklistMeta = {} } = await getLocal<{ networkBlocklistMeta?: Record<string, NetworkBlockMeta> }>("networkBlocklistMeta");
                    const metadataKey = mergedBlocklist.find((rule) => hostnamesMatch(rule.value, normalizedDomain))?.value || normalizedDomain;
                    const nextMeta = normalizeNetworkBlocklistMetaRecord(networkBlocklistMeta);
                    await setLocal({
                        networkBlocklistMeta: {
                            ...nextMeta,
                            [metadataKey]: {
                                source: message.source,
                                addedAt: Date.now(),
                            },
                        },
                    });
                }

                await deps.applyRules();
                return { success: true };
            },

            BULK_ADD_RULES: async (message) => {
                const { networkBlocklist = [], customHidingRules = {} } = await getSync<{
                    networkBlocklist?: ToggleableRule[];
                    customHidingRules?: Record<string, ToggleableRule[]>;
                }>(["networkBlocklist", "customHidingRules"]);

                const mergedNetworkBlocklist = mergeNetworkRules(networkBlocklist, message.data.networkBlocklist);
                const mergedCustomHidingRules = mergeCustomHidingRules(
                    customHidingRules,
                    message.data.customHidingRules.domain,
                    message.data.customHidingRules.selectors,
                );

                await setSync({
                    networkBlocklist: mergedNetworkBlocklist,
                    customHidingRules: mergedCustomHidingRules,
                });

                await applyRulesAndReapplyHiding();
                return { success: true };
            },

            TEMPORARILY_ALLOW_DOMAIN: async (message) => {
                const { sessionAllowlist = [] } = await getSession<{ sessionAllowlist?: string[] }>("sessionAllowlist");
                const normalizedDomain = normalizeDomain(message.domain);
                if (!normalizedDomain) {
                    return { success: true };
                }

                if (!listHasMatchingHostname(sessionAllowlist, normalizedDomain)) {
                    await setSession({ sessionAllowlist: [...sessionAllowlist, normalizedDomain] });
                    await deps.applyRules();
                }
                return { success: true };
            },

            PAUSE_PROTECTION: async () => {
                const pauseUntil = Date.now() + PAUSE_PROTECTION_DURATION_MS;
                await setLocal({ protectionPausedUntil: pauseUntil });
                await chrome.alarms.create("resumeProtection", { delayInMinutes: 15 });
                await deps.applyRules();
                return { success: true, pauseUntil };
            },

            RESUME_PROTECTION: async () => {
                await removeLocal("protectionPausedUntil");
                await chrome.alarms.clear("resumeProtection");
                await deps.applyRules();
                return { success: true };
            },

            START_FOCUS_MODE: async (message) => {
                await startFocusMode(message.duration);
                await chrome.alarms.create(FOCUS_MODE_END_ALARM, {
                    when: Date.now() + (message.duration * 60 * 1_000),
                });
                await applyRulesDebounced();
                return { success: true };
            },

            STOP_FOCUS_MODE: async () => {
                await stopFocusMode();
                await chrome.alarms.clear(FOCUS_MODE_END_ALARM);
                await applyRulesDebounced();
                return { success: true };
            },

            RESET_SETTINGS_TO_DEFAULTS: async () => {
                await resetRuleSettingsToDefaults();
                await applyRulesAndReapplyHiding();
                return { success: true };
            },

            REAPPLY_HIDING_RULES: async () => {
                await reapplyHidingRules(deps.broadcastToAllTabs);
                return { success: true };
            },
        },
    };
}
