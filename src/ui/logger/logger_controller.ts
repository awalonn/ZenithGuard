import { getRuleFamily, getRuleFamilyLabel, getTopMatchedSources, getTopRuleFamilies } from "../../js/background/modules/network_logger/network_log_analytics";
import { normalizeDomain } from "../../js/background/modules/storage/defaults";
import { openAnalyzerPage, openSettingsPage } from "../../js/shared/browser";
import { findMatchingRecordEntry, findMatchingRecordValue, hostnamesMatch } from "../../js/shared/hostname_matching";
import { normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import {
    addToNetworkBlocklist,
    isNetworkLogResetMessage,
    isNetworkLogUpdateMessage,
    sendMessage,
} from "../../js/shared/runtime_messages";
import { getLocal, getSync, setLocal, setSync } from "../../js/shared/storage_api";
import { getAdTechReviewReason } from "../shared/ad_tech_signals";
import { buildRedactedReviewCandidateList } from "../shared/review_candidates";
import type {
    LoggerActiveFilterTag,
    LoggerEntry,
    LoggerFilterState,
    LoggerStatSummary,
    LoggerSupportData,
    LoggerVisibleEntry,
} from "./types";

type ToggleableNetworkRule = {
    value?: string;
    enabled?: boolean;
};

function formatSessionTime(timestamp: number | null): string {
    if (!timestamp) {
        return "";
    }

    try {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "";
    }
}

function getHostname(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed).hostname.toLowerCase();
    } catch {
        const match = trimmed.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:?#]|$)/i);
        return match ? match[1].toLowerCase() : null;
    }
}

function normalizeRuleValues(values: string[]): string[] {
    const normalized = new Set<string>();
    for (const value of values) {
        const candidate = normalizeDomain(value) || value.trim().toLowerCase();
        if (candidate) {
            normalized.add(candidate);
        }
    }
    return Array.from(normalized);
}

function isHostnameMatch(hostname: string, ruleValue: string): boolean {
    return hostnamesMatch(hostname, ruleValue);
}

export function formatLoggerTimestamp(timestamp: number): string {
    try {
        const date = new Date(timestamp);
        const base = date.toLocaleTimeString([], {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        return `${base}.${String(date.getMilliseconds()).padStart(3, "0")}`;
    } catch {
        return "";
    }
}

export function getEntryDomain(entry: LoggerEntry): string | null {
    return getHostname(entry.url);
}

export function getInitiatorDomain(entry: LoggerEntry): string | null {
    return entry.initiator ? getHostname(entry.initiator) : null;
}

function isThirdParty(entry: LoggerEntry): boolean {
    const domain = getEntryDomain(entry);
    const initiator = getInitiatorDomain(entry);
    if (!domain || !initiator) {
        return false;
    }

    return !isHostnameMatch(domain, initiator) && !isHostnameMatch(initiator, domain);
}

function getCustomOriginLabel(source?: string): string {
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
            return "Custom blocklist";
    }
}

function getCustomMatchedValue(entry: LoggerEntry): string | null {
    const value = entry.matchedRuleInfo?.matchedValue?.trim();
    return value ? value : null;
}

function isCoveredByAnyRule(hostname: string, supportData: LoggerSupportData): boolean {
    const userRules = normalizeRuleValues(supportData.networkBlocklist);
    const builtInRules = normalizeRuleValues(supportData.defaultBlocklist);
    return [...userRules, ...builtInRules].some((rule) => isHostnameMatch(hostname, rule));
}

function getLoggerReviewReason(entry: LoggerEntry): string | null {
    if (entry.status !== "allowed" || !isThirdParty(entry)) {
        return null;
    }

    const hostname = getEntryDomain(entry) || "";
    return getAdTechReviewReason(`${hostname} ${entry.url}`);
}

export function mapVisibleEntry(entry: LoggerEntry, supportData: LoggerSupportData): LoggerVisibleEntry {
    const domain = getEntryDomain(entry);
    const customBlockCandidate = domain ? normalizeDomain(domain) || domain : null;
    const customMatchedValue = getCustomMatchedValue(entry);
    const customMeta = customMatchedValue
        ? findMatchingRecordValue(supportData.networkBlocklistMeta, customMatchedValue.toLowerCase())
        : null;
    const canAddCustomBlock = Boolean(
        domain
        && entry.status === "allowed"
        && isThirdParty(entry)
        && !isCoveredByAnyRule(domain, supportData),
    );

    return {
        ...entry,
        domain,
        initiatorDomain: getInitiatorDomain(entry),
        family: getRuleFamily(entry),
        customOriginLabel: customMatchedValue
            ? getCustomOriginLabel(customMeta?.source)
            : null,
        customMatchedValue,
        customBlockCandidate,
        reviewReason: canAddCustomBlock ? getLoggerReviewReason(entry) : null,
        needsReview: canAddCustomBlock,
        canAddCustomBlock,
    };
}

export function filterLoggerEntries(entries: LoggerVisibleEntry[], filters: LoggerFilterState): LoggerVisibleEntry[] {
    const search = filters.search.trim().toLowerCase();

    return entries.filter((entry) => {
        if (filters.status !== "all" && entry.status !== filters.status) {
            return false;
        }

        if (filters.review === "needs-review" && !entry.needsReview) {
            return false;
        }

        if (filters.family !== "all" && entry.family !== filters.family) {
            return false;
        }

        if (filters.source && entry.matchedRuleInfo?.source !== filters.source) {
            return false;
        }

        if (!search) {
            return true;
        }

        const haystacks = [
            entry.url,
            entry.type || "",
            entry.initiator || "",
            entry.matchedRuleInfo?.source || "",
            entry.matchedRuleInfo?.category || "",
            entry.matchedRuleInfo?.detail || "",
            entry.matchedRuleInfo?.matchedValue || "",
            entry.reviewReason || "",
        ];

        return haystacks.some((value) => value.toLowerCase().includes(search));
    });
}

export function getLoggerStats(
    entries: LoggerEntry[],
    visibleEntries: LoggerVisibleEntry[],
    tabId: number | null,
    sessionStartedAt: number | null = null,
    lastUpdatedAt: number | null = null,
): LoggerStatSummary {
    const startedLabel = formatSessionTime(sessionStartedAt);
    const lastUpdatedLabel = formatSessionTime(lastUpdatedAt);

    return {
        session: tabId ? "Live page load" : "No tab selected",
        sessionScope: tabId
            ? (startedLabel ? `Requests since the last top-level navigation at ${startedLabel}` : "Requests since the last top-level navigation")
            : "Open the logger from a live tab to inspect current requests.",
        sessionStartedAtLabel: startedLabel,
        lastUpdatedAtLabel: lastUpdatedLabel,
        blocked: entries.filter((entry) => entry.status === "blocked").length,
        modified: entries.filter((entry) => entry.status === "modified").length,
        allowed: entries.filter((entry) => entry.status === "allowed").length,
        visible: visibleEntries.length,
    };
}

export function getLoggerReviewCount(entries: LoggerVisibleEntry[]): number {
    return entries.filter((entry) => entry.needsReview).length;
}

export function buildLoggerReviewList(entries: LoggerVisibleEntry[], tabLabel = "Current tab"): string {
    if (!entries.some((entry) => entry.needsReview)) {
        return "";
    }

    return buildRedactedReviewCandidateList(
        entries.filter((entry) => entry.needsReview).map((entry) => ({
            url: entry.url,
            status: entry.status,
            type: entry.type,
            initiator: entry.initiator,
            domain: entry.domain,
            candidate: entry.customBlockCandidate || (entry.domain ? `||${entry.domain}^` : null),
            reason: entry.reviewReason,
            timestamp: entry.timestamp,
        })),
        { tabLabel, includeUnclassified: true },
    );
}

export function buildLoggerDomainFilter(entry: LoggerVisibleEntry): string | null {
    const candidate = String(entry.customBlockCandidate || entry.domain || "").trim();
    if (!candidate) {
        return null;
    }

    if (candidate.startsWith("||") || candidate.includes("*") || candidate.includes("/")) {
        return candidate;
    }

    return `||${candidate}^`;
}

export function buildLoggerDomainFilterList(entries: LoggerVisibleEntry[]): string {
    const filters = new Set<string>();
    for (const entry of entries) {
        if (!entry.needsReview) {
            continue;
        }

        const filter = buildLoggerDomainFilter(entry);
        if (filter) {
            filters.add(filter);
        }
    }

    return Array.from(filters).join("\n");
}

export function getLoggerBulkBlockCandidates(entries: LoggerVisibleEntry[]): string[] {
    const candidates = new Set<string>();
    for (const entry of entries) {
        if (!entry.needsReview) {
            continue;
        }

        const candidate = normalizeDomain(entry.customBlockCandidate || entry.domain || "");
        if (candidate) {
            candidates.add(candidate);
        }
    }

    return Array.from(candidates);
}

export function getLoggerDomainFilterListCount(entries: LoggerVisibleEntry[]): number {
    const list = buildLoggerDomainFilterList(entries);
    return list ? list.split("\n").length : 0;
}

export function getLoggerDomainFilterListCopyLabel(count: number, state: "" | "copied"): string {
    const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    const noun = safeCount === 1 ? "Filter" : "Filters";
    return state === "copied" ? `Copied ${safeCount} ${noun}` : `Copy ${safeCount} ${noun}`;
}

export function getLoggerBulkAddFiltersLabel(count: number, state: "" | "confirming" | "adding" | "added"): string {
    const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    const noun = safeCount === 1 ? "Filter" : "Filters";
    if (state === "confirming") {
        return `Confirm Add ${safeCount} ${noun}`;
    }
    if (state === "adding") {
        return `Adding ${safeCount} ${noun}`;
    }
    if (state === "added") {
        return `Updated ${safeCount} ${noun}`;
    }
    return `Add ${safeCount} ${noun}`;
}

export function getLoggerDomainFilterCopyLabel(entry: LoggerVisibleEntry, copiedEntryId: number | null): string {
    return copiedEntryId === entry.id ? "Copied filter" : "Copy domain filter";
}

function formatLoggerBulkAddResultMessage(createdCount: number, reEnabledCount: number): string {
    const parts: string[] = [];
    if (createdCount > 0) {
        parts.push(`Added ${createdCount} new ${createdCount === 1 ? "filter" : "filters"}`);
    }
    if (reEnabledCount > 0) {
        parts.push(`re-enabled ${reEnabledCount} existing ${reEnabledCount === 1 ? "filter" : "filters"}`);
    }

    const message = parts.join(" and ");
    return message ? `${message.charAt(0).toUpperCase()}${message.slice(1)}.` : "No visible filters changed.";
}

export function getActiveFilterTags(filters: LoggerFilterState): LoggerActiveFilterTag[] {
    const tags: LoggerActiveFilterTag[] = [];

    if (filters.status !== "all") {
        tags.push({
            id: "status",
            label: `Status: ${filters.status === "modified" ? "cleaned" : filters.status}`,
        });
    }

    if (filters.family !== "all") {
        tags.push({
            id: "family",
            label: `Family: ${getRuleFamilyLabel(filters.family)}`,
        });
    }

    if (filters.review === "needs-review") {
        tags.push({
            id: "review",
            label: "Review: allowed third-party misses",
        });
    }

    if (filters.source) {
        tags.push({
            id: "source",
            label: `Source: ${filters.source}`,
        });
    }

    if (filters.search.trim()) {
        tags.push({
            id: "search",
            label: `Search: ${filters.search.trim()}`,
        });
    }

    return tags;
}

export function getLoggerCoverage(entries: LoggerEntry[]): {
    topFamilies: Array<{ family: ReturnType<typeof getRuleFamily>; label: string; count: number }>;
    topSources: Array<{ source: string; count: number }>;
} {
    return {
        topFamilies: getTopRuleFamilies(entries, 4).map(([family, count]) => ({
            family,
            label: getRuleFamilyLabel(family),
            count,
        })),
        topSources: getTopMatchedSources(entries, 4).map(([source, count]) => ({ source, count })),
    };
}

export async function clearLogger(tabId: number): Promise<void> {
    await sendMessage({ type: "CLEAR_NETWORK_LOG", tabId });
}

export async function openLoggerAnalyzer(tabId: number | null): Promise<void> {
    if (typeof tabId !== "number") {
        return;
    }

    await openAnalyzerPage(tabId);
}

export async function manageLoggerEntryInRules(entry: LoggerVisibleEntry): Promise<void> {
    if (!entry.domain) {
        return;
    }

    await openSettingsPage({
        section: "my-rules",
        domain: entry.domain,
        focus: "network-blocklist",
    });
}

export async function addLoggerEntryToBlocklist(entry: LoggerVisibleEntry): Promise<{ success: boolean; message?: string }> {
    const candidate = entry.customBlockCandidate || entry.domain;
    if (!candidate) {
        return { success: false, message: "No domain available for this request." };
    }

    const response = await addToNetworkBlocklist(candidate, "logger");
    await sendMessage({ type: "APPLY_ALL_RULES" }).catch(() => {});

    return {
        success: response.success === true || response.message === "Rule already exists.",
        message: response.message,
    };
}

export async function addLoggerVisibleFiltersToBlocklist(entries: LoggerVisibleEntry[]): Promise<{ success: boolean; added: number; addedFilters: string[]; message?: string }> {
    const candidates = getLoggerBulkBlockCandidates(entries);
    if (candidates.length === 0) {
        return { success: false, added: 0, addedFilters: [], message: "No visible reviewable filters to add." };
    }

    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{ networkBlocklist?: ToggleableNetworkRule[] }>("networkBlocklist"),
        getLocal<{ networkBlocklistMeta?: LoggerSupportData["networkBlocklistMeta"] }>("networkBlocklistMeta"),
    ]);

    const existingRules = Array.isArray(syncSnapshot.networkBlocklist) ? syncSnapshot.networkBlocklist : [];
    const nextRules: Array<{ value: string; enabled: boolean }> = [];
    const seenValues = new Set<string>();

    for (const rule of existingRules) {
        const value = normalizeDomain(rule?.value || "");
        if (!value || seenValues.has(value)) {
            continue;
        }

        seenValues.add(value);
        nextRules.push({
            value,
            enabled: rule.enabled !== false,
        });
    }

    const addedCandidates: string[] = [];
    const undoableCandidates: string[] = [];
    for (const candidate of candidates) {
        const existingIndex = nextRules.findIndex((rule) => hostnamesMatch(rule.value, candidate));
        if (existingIndex >= 0) {
            if (nextRules[existingIndex].enabled === false) {
                nextRules[existingIndex] = {
                    ...nextRules[existingIndex],
                    enabled: true,
                };
                addedCandidates.push(nextRules[existingIndex].value);
            }
            continue;
        }

        seenValues.add(candidate);
        nextRules.push({ value: candidate, enabled: true });
        addedCandidates.push(candidate);
        undoableCandidates.push(candidate);
    }

    if (addedCandidates.length === 0) {
        return { success: false, added: 0, addedFilters: [], message: "All visible filters are already in the custom blocklist." };
    }

    const nextMeta = normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta);
    const addedAt = Date.now();
    for (const candidate of addedCandidates) {
        const isNewRule = undoableCandidates.some((undoableCandidate) => hostnamesMatch(undoableCandidate, candidate));
        const hasExistingMeta = Boolean(findMatchingRecordEntry(nextMeta, candidate));
        if (!isNewRule && hasExistingMeta) {
            continue;
        }

        nextMeta[candidate] = {
            source: "logger",
            addedAt,
        };
    }

    await Promise.all([
        setSync({ networkBlocklist: nextRules }),
        setLocal({ networkBlocklistMeta: nextMeta }),
    ]);
    await sendMessage({ type: "APPLY_ALL_RULES" }).catch(() => {});

    return {
        success: true,
        added: addedCandidates.length,
        addedFilters: undoableCandidates,
        message: formatLoggerBulkAddResultMessage(undoableCandidates.length, addedCandidates.length - undoableCandidates.length),
    };
}

export async function undoLoggerBulkAddedFilters(filters: string[]): Promise<{ success: boolean; removed: number; message?: string }> {
    const candidates = Array.from(new Set(
        filters
            .map((filter) => normalizeDomain(filter))
            .filter((filter): filter is string => Boolean(filter)),
    ));
    if (candidates.length === 0) {
        return { success: false, removed: 0, message: "No bulk-added filters to undo." };
    }

    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{ networkBlocklist?: ToggleableNetworkRule[] }>("networkBlocklist"),
        getLocal<{ networkBlocklistMeta?: LoggerSupportData["networkBlocklistMeta"] }>("networkBlocklistMeta"),
    ]);

    const existingRules = Array.isArray(syncSnapshot.networkBlocklist) ? syncSnapshot.networkBlocklist : [];
    const nextRules = existingRules.filter((rule) => {
        const value = normalizeDomain(rule?.value || "");
        return !value || !candidates.some((candidate) => hostnamesMatch(value, candidate));
    });
    const removed = existingRules.length - nextRules.length;

    if (removed === 0) {
        return { success: false, removed: 0, message: "Those bulk-added filters are no longer present." };
    }

    const nextMeta = normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta);
    for (const candidate of candidates) {
        const matchedMetaKey = findMatchingRecordEntry(nextMeta, candidate)?.key || candidate;
        delete nextMeta[matchedMetaKey];
    }

    await Promise.all([
        setSync({ networkBlocklist: nextRules }),
        setLocal({ networkBlocklistMeta: nextMeta }),
    ]);
    await sendMessage({ type: "APPLY_ALL_RULES" }).catch(() => {});

    return {
        success: true,
        removed,
        message: `Removed ${removed} ${removed === 1 ? "filter" : "filters"}.`,
    };
}

export async function removeLoggerCustomBlock(entry: LoggerVisibleEntry): Promise<void> {
    if (!entry.customMatchedValue) {
        return;
    }

    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{ networkBlocklist?: Array<{ value?: string; enabled?: boolean }> }>("networkBlocklist"),
        getLocal<{ networkBlocklistMeta?: LoggerSupportData["networkBlocklistMeta"] }>("networkBlocklistMeta"),
    ]);

    const matchedValue = entry.customMatchedValue.toLowerCase();
    const nextBlocklist = Array.isArray(syncSnapshot.networkBlocklist)
        ? syncSnapshot.networkBlocklist.filter((rule) => !hostnamesMatch(String(rule?.value || "").trim().toLowerCase(), matchedValue))
        : [];

    const nextMeta = normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta);
    const matchedMetaKey = findMatchingRecordEntry(nextMeta, matchedValue)?.key || matchedValue;
    delete nextMeta[matchedMetaKey];

    await Promise.all([
        setSync({ networkBlocklist: nextBlocklist }),
        setLocal({ networkBlocklistMeta: nextMeta }),
        sendMessage({ type: "APPLY_ALL_RULES" }).catch(() => {}),
    ]);
}

export function attachLoggerMessageListener(
    tabId: number | null,
    onUpdate: (entry: LoggerEntry) => void,
    onReset?: (sessionStartedAt: number | null) => void,
): () => void {
    return attachDynamicLoggerMessageListener(() => tabId, onUpdate, onReset);
}

export function attachDynamicLoggerMessageListener(
    getTabId: () => number | null,
    onUpdate: (entry: LoggerEntry) => void,
    onReset?: (sessionStartedAt: number | null) => void,
): () => void {
    const listener = (message: unknown): void => {
        const tabId = getTabId();
        if (typeof tabId === "number" && isNetworkLogUpdateMessage(message) && message.tabId === tabId) {
            onUpdate(message.log as LoggerEntry);
            return;
        }

        if (typeof tabId === "number" && onReset && isNetworkLogResetMessage(message) && message.tabId === tabId) {
            onReset(message.sessionStartedAt);
        }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
        chrome.runtime.onMessage.removeListener(listener);
    };
}
