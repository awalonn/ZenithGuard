import {
    FOCUS_MODE_DEFAULT_BLOCKLIST,
    getDefaultBlocklistEntries,
    getDefaultBlocklistOverrides,
    getDefaultHeuristicKeywordEntries,
    getHeuristicValidationMessage,
    getNetworkRuleValidationMessage,
    normalizeDomain,
    validateHeuristicKeyword,
    validateNetworkRuleValue,
} from "../../js/background/modules/storage/defaults";
import { findMatchingRecordEntry, hostnamesMatch, listHasMatchingHostname } from "../../js/shared/hostname_matching";
import { getCanonicalNetworkBlockMetaKey, normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import { requestBrowsingDataPermission } from "../../js/shared/optional_permissions";
import { sendMessageSafely } from "../../js/shared/runtime_messages";
import { getLocal, setLocal, setSync } from "../../js/shared/storage_api";
import type {
    CustomHidingRules,
    NetworkBlocklistMeta,
    NetworkRuleOriginFilter,
    PersistentWallFixMap,
    ToggleableRule,
} from "./types";

export type ToggleableRuleListKey =
    | "defaultBlocklist"
    | "networkBlocklist"
    | "isolationModeSites"
    | "forgetfulSites"
    | "heuristicKeywords";

function getNetworkMetaKey(value: string): string {
    return getCanonicalNetworkBlockMetaKey(value);
}

function getCanonicalSiteBucketKey(value: string): string {
    const candidate = (normalizeDomain(value) || value.trim().toLowerCase()).toLowerCase();
    return candidate.startsWith("www.") ? candidate.slice(4) : candidate;
}

function normalizeCustomHidingRuleBuckets(rules: CustomHidingRules): CustomHidingRules {
    const normalized: CustomHidingRules = {};

    for (const [domain, entries] of Object.entries(rules || {})) {
        const canonical = getCanonicalSiteBucketKey(domain);
        if (!canonical || !Array.isArray(entries)) {
            continue;
        }

        const merged = new Map<string, CustomHidingRules[string][number]>();
        for (const existing of normalized[canonical] || []) {
            merged.set(existing.value, existing);
        }

        for (const entry of entries) {
            const current = merged.get(entry.value);
            merged.set(entry.value, {
                ...entry,
                enabled: Boolean((current?.enabled ?? false) || entry.enabled),
                ...(typeof current?.lastHealed === "number" && (typeof entry.lastHealed !== "number" || current.lastHealed > entry.lastHealed)
                    ? { lastHealed: current.lastHealed }
                    : {}),
                ...(typeof current?.lastHealAttempt === "number" && (typeof entry.lastHealAttempt !== "number" || current.lastHealAttempt > entry.lastHealAttempt)
                    ? { lastHealAttempt: current.lastHealAttempt }
                    : {}),
            });
        }

        normalized[canonical] = Array.from(merged.values());
    }

    return normalized;
}

function normalizePersistentWallFixMap(values: PersistentWallFixMap): PersistentWallFixMap {
    const normalized: PersistentWallFixMap = {};

    for (const [domain, fix] of Object.entries(values || {})) {
        const canonical = getCanonicalSiteBucketKey(domain);
        if (!canonical || !fix || typeof fix !== "object") {
            continue;
        }

        normalized[canonical] = normalized[canonical]
            ? {
                ...fix,
                ...normalized[canonical],
            }
            : { ...fix };
    }

    return normalized;
}

function findMatchingRuleValue(list: ToggleableRule[], domain: string): string | null {
    const match = list.find((rule) => hostnamesMatch(rule.value, domain));
    return match?.value || null;
}

function addValidatedDomain(
    list: ToggleableRule[],
    input: string,
    duplicateMessage: string,
): { nextList: ToggleableRule[]; nextValue: string } {
    const validation = validateNetworkRuleValue(input);
    if (!validation.normalizedValue) {
        if (!input.trim()) {
            return { nextList: list, nextValue: input };
        }

        throw new Error(getNetworkRuleValidationMessage(validation.reason));
    }

    const existing = list.find((rule) => rule.value === validation.normalizedValue);
    if (existing) {
        if (existing.enabled !== false) {
            throw new Error(duplicateMessage);
        }

        return {
            nextList: list.map((rule) => rule.value === validation.normalizedValue ? { ...rule, enabled: true } : rule),
            nextValue: "",
        };
    }

    return {
        nextList: [...list, { value: validation.normalizedValue, enabled: true }],
        nextValue: "",
    };
}

export function addPausedDomain(list: string[], input: string): { nextList: string[]; nextValue: string } {
    const validation = validateNetworkRuleValue(input);
    if (!validation.normalizedValue) {
        if (!input.trim()) {
            return { nextList: list, nextValue: input };
        }

        throw new Error(getNetworkRuleValidationMessage(validation.reason));
    }

    if (listHasMatchingHostname(list, validation.normalizedValue)) {
        throw new Error("Protection is already paused for this domain.");
    }

    return {
        nextList: [...list, validation.normalizedValue],
        nextValue: "",
    };
}

export function removePausedDomain(list: string[], domain: string): string[] {
    return list.filter((value) => !hostnamesMatch(value, domain));
}

export function addDomainRule(
    list: ToggleableRule[],
    input: string,
    duplicateMessage: string,
): { nextList: ToggleableRule[]; nextValue: string } {
    const validation = validateNetworkRuleValue(input);
    if (!validation.normalizedValue) {
        if (!input.trim()) {
            return { nextList: list, nextValue: input };
        }

        throw new Error(getNetworkRuleValidationMessage(validation.reason));
    }

    const existing = list.find((rule) => hostnamesMatch(rule.value, validation.normalizedValue));
    if (existing) {
        if (existing.enabled !== false) {
            throw new Error(duplicateMessage);
        }

        return {
            nextList: list.map((rule) => hostnamesMatch(rule.value, validation.normalizedValue) ? { ...rule, enabled: true } : rule),
            nextValue: "",
        };
    }

    return {
        nextList: [...list, { value: validation.normalizedValue, enabled: true }],
        nextValue: "",
    };
}

export function deleteDomainRule(list: ToggleableRule[], domain: string): ToggleableRule[] {
    return list.filter((rule) => !hostnamesMatch(rule.value, domain));
}

export function addNetworkRule(
    list: ToggleableRule[],
    meta: NetworkBlocklistMeta,
    input: string,
): { nextList: ToggleableRule[]; nextValue: string; nextMeta: NetworkBlocklistMeta } {
    const result = addValidatedDomain(list, input, "Domain already exists.");
    const key = getNetworkMetaKey(input);

    return {
        nextList: result.nextList,
        nextValue: result.nextValue,
        nextMeta: {
            ...meta,
            [key]: {
                ...(meta[key] || {}),
                source: meta[key]?.source || "settings",
                addedAt: meta[key]?.addedAt || Date.now(),
            },
        },
    };
}

export function deleteNetworkRule(
    list: ToggleableRule[],
    meta: NetworkBlocklistMeta,
    domain: string,
): { nextList: ToggleableRule[]; nextMeta: NetworkBlocklistMeta } {
    const nextMeta = { ...meta };
    const matchedValue = findMatchingRuleValue(list, domain);
    delete nextMeta[getNetworkMetaKey(matchedValue || domain)];

    return {
        nextList: deleteDomainRule(list, domain),
        nextMeta,
    };
}

export function getNetworkRuleMeta(
    ruleValue: string,
    meta: NetworkBlocklistMeta,
): NetworkBlocklistMeta[string] | null {
    return findMatchingRecordEntry(meta, getNetworkMetaKey(ruleValue))?.value || null;
}

export function getNetworkRuleOriginSource(
    ruleValue: string,
    meta: NetworkBlocklistMeta,
): string {
    return getNetworkRuleMeta(ruleValue, meta)?.source || "custom";
}

export function matchesNetworkRuleOriginFilter(
    ruleValue: string,
    meta: NetworkBlocklistMeta,
    filter: NetworkRuleOriginFilter,
): boolean {
    if (filter === "all") {
        return true;
    }

    return getNetworkRuleOriginSource(ruleValue, meta) === filter;
}

export function toggleRuleAtIndex(list: ToggleableRule[], index: number, enabled: boolean): ToggleableRule[] {
    return list.map((rule, candidateIndex) => candidateIndex === index ? { ...rule, enabled } : rule);
}

export function toggleRulesByIndexes(list: ToggleableRule[], indexes: number[], enabled: boolean): ToggleableRule[] {
    const targetIndexes = new Set(indexes);
    return list.map((rule, index) => targetIndexes.has(index) ? { ...rule, enabled } : rule);
}

export function addHeuristicKeyword(
    list: ToggleableRule[],
    input: string,
): { nextList: ToggleableRule[]; nextValue: string } {
    const validation = validateHeuristicKeyword(input);
    if (!validation.normalizedValue) {
        if (!input.trim()) {
            return { nextList: list, nextValue: input };
        }

        throw new Error(getHeuristicValidationMessage(validation.reason));
    }

    const existing = list.find((rule) => rule.value === validation.normalizedValue);
    if (existing) {
        if (existing.enabled !== false) {
            throw new Error("Keyword already exists.");
        }

        return {
            nextList: list.map((rule) => rule.value === validation.normalizedValue ? { ...rule, enabled: true } : rule),
            nextValue: "",
        };
    }

    return {
        nextList: [...list, { value: validation.normalizedValue, enabled: true }],
        nextValue: "",
    };
}

export function deleteHeuristicKeyword(list: ToggleableRule[], keyword: string): ToggleableRule[] {
    return list.filter((rule) => rule.value !== keyword);
}

export function getEffectiveFocusDomains(customDomains: string[]): { domains: string[]; usesDefaults: boolean } {
    if (customDomains.length > 0) {
        return { domains: customDomains, usesDefaults: false };
    }

    return {
        domains: [...FOCUS_MODE_DEFAULT_BLOCKLIST],
        usesDefaults: true,
    };
}

export function addFocusDomain(customDomains: string[], input: string): { nextList: string[]; nextValue: string } {
    const validation = validateNetworkRuleValue(input);
    if (!validation.normalizedValue) {
        if (!input.trim()) {
            return { nextList: customDomains, nextValue: input };
        }

        throw new Error("Enter a valid domain or URL.");
    }

    const base = customDomains.length > 0 ? [...customDomains] : [...FOCUS_MODE_DEFAULT_BLOCKLIST];
    if (listHasMatchingHostname(base, validation.normalizedValue)) {
        throw new Error("Domain already exists.");
    }

    return {
        nextList: [...base, validation.normalizedValue],
        nextValue: "",
    };
}

export function removeFocusDomain(customDomains: string[], domain: string): string[] {
    const base = customDomains.length > 0 ? [...customDomains] : [...FOCUS_MODE_DEFAULT_BLOCKLIST];
    return base.filter((value) => !hostnamesMatch(value, domain));
}

export function resetFocusDomains(): string[] {
    return [];
}

export function toggleWallFix(map: PersistentWallFixMap, domain: string, enabled: boolean): PersistentWallFixMap {
    const matchedDomain = findMatchingRecordEntry(map, domain)?.key || domain;
    if (!map[matchedDomain]) {
        return map;
    }

    return {
        ...map,
        [matchedDomain]: {
            ...map[matchedDomain],
            enabled,
        },
    };
}

export function toggleWallFixesBulk(map: PersistentWallFixMap, domains: string[], enabled: boolean): PersistentWallFixMap {
    const targets = new Set(domains);
    return Object.fromEntries(
        Object.entries(map).map(([domain, fix]) => [
            domain,
            targets.has(domain)
                ? { ...fix, enabled }
                : fix,
        ]),
    );
}

export function deleteWallFix(map: PersistentWallFixMap, domain: string): PersistentWallFixMap {
    const next = { ...map };
    const matchedDomain = findMatchingRecordEntry(next, domain)?.key || domain;
    delete next[matchedDomain];
    return next;
}

export function toggleExpandedDomain(expanded: Set<string>, domain: string): Set<string> {
    const next = new Set(expanded);
    const matchedDomain = Array.from(next).find((value) => hostnamesMatch(value, domain)) || domain;
    if (next.has(matchedDomain)) {
        next.delete(matchedDomain);
    } else {
        next.add(domain);
    }
    return next;
}

export function deleteHidingDomain(
    rules: CustomHidingRules,
    expanded: Set<string>,
    domain: string,
): { customHidingRules: CustomHidingRules; expandedHidingDomains: Set<string> } {
    const nextRules = { ...rules };
    const matchedDomain = findMatchingRecordEntry(nextRules, domain)?.key || domain;
    delete nextRules[matchedDomain];

    const nextExpanded = new Set(expanded);
    const expandedMatch = Array.from(nextExpanded).find((value) => hostnamesMatch(value, domain)) || matchedDomain;
    nextExpanded.delete(expandedMatch);

    return {
        customHidingRules: nextRules,
        expandedHidingDomains: nextExpanded,
    };
}

export function deleteSingleHidingRule(
    rules: CustomHidingRules,
    expanded: Set<string>,
    domain: string,
    index: number,
): { customHidingRules: CustomHidingRules; expandedHidingDomains: Set<string> } | null {
    const matchedDomain = findMatchingRecordEntry(rules, domain)?.key || domain;
    const domainRules = rules[matchedDomain];
    if (!domainRules || !domainRules[index]) {
        return null;
    }

    const nextRules = { ...rules };
    const nextDomainRules = [...domainRules];
    nextDomainRules.splice(index, 1);

    const nextExpanded = new Set(expanded);
    if (nextDomainRules.length === 0) {
        delete nextRules[matchedDomain];
        const expandedMatch = Array.from(nextExpanded).find((value) => hostnamesMatch(value, domain)) || matchedDomain;
        nextExpanded.delete(expandedMatch);
    } else {
        nextRules[matchedDomain] = nextDomainRules;
    }

    return {
        customHidingRules: nextRules,
        expandedHidingDomains: nextExpanded,
    };
}

export async function persistStringList(key: "disabledSites" | "focusBlocklist", values: string[]): Promise<void> {
    await setSync({ [key]: values });
}

export async function persistToggleableList(
    key: ToggleableRuleListKey,
    values: ToggleableRule[],
    requestBrowsingDataAccess = false,
): Promise<void> {
    if (key === "forgetfulSites" && requestBrowsingDataAccess) {
        await requestBrowsingDataPermission();
    }
    await setSync({ [key]: key === "defaultBlocklist" ? getDefaultBlocklistOverrides(values) : values });
}

export async function persistNetworkBlocklist(values: ToggleableRule[], meta: NetworkBlocklistMeta): Promise<void> {
    await Promise.all([
        setSync({ networkBlocklist: values }),
        setLocal({ networkBlocklistMeta: normalizeNetworkBlocklistMetaRecord(meta) }),
    ]);
}

export async function persistWallFixes(values: PersistentWallFixMap): Promise<void> {
    await setSync({ persistentWallFixes: normalizePersistentWallFixMap(values) });
    sendMessageSafely({ type: "REAPPLY_HIDING_RULES" });
}

export async function persistCustomHidingRules(values: CustomHidingRules): Promise<void> {
    await setSync({ customHidingRules: normalizeCustomHidingRuleBuckets(values) });
    sendMessageSafely({ type: "REAPPLY_HIDING_RULES" });
}

export async function resetBuiltInCoreRules(): Promise<ToggleableRule[]> {
    const next = getDefaultBlocklistEntries();
    await setSync({ defaultBlocklist: [] });
    return next;
}

export async function resetHeuristicKeywords(): Promise<ToggleableRule[]> {
    const next = getDefaultHeuristicKeywordEntries();
    await persistToggleableList("heuristicKeywords", next);
    return next;
}

export async function refreshNetworkBlocklistMeta(): Promise<NetworkBlocklistMeta> {
    const snapshot = await getLocal<Record<string, unknown>>(["networkBlocklistMeta"]);
    return normalizeNetworkBlocklistMetaRecord(snapshot.networkBlocklistMeta);
}

export function getCustomOriginLabel(source?: string): string {
    switch (source) {
        case "analyzer":
            return "Added from Analyzer";
        case "logger":
            return "Added from Logger";
        case "inspector":
            return "Added from Inspector";
        case "settings":
            return "Added in Settings";
        case "local-ai":
            return "Added from Local AI";
        default:
            return "Custom";
    }
}

export function formatRuleTimestamp(timestamp?: number): string {
    if (!timestamp) {
        return "No timestamp";
    }

    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return "No timestamp";
    }
}
