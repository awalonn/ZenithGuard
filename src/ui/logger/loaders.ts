import { getActiveTab, getTabById } from "../../js/shared/browser";
import { getEffectiveDefaultBlocklistEntries } from "../../js/background/modules/storage/defaults";
import { normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import { getLocal, getSync } from "../../js/shared/storage_api";
import { getNetworkLog } from "../../js/shared/runtime_messages";
import type { NetworkLogEntryResponse } from "../../js/shared/runtime_messages";
import type { LoggerContext, LoggerEntry, LoggerLogSnapshot, LoggerReviewFilter, LoggerStatusFilter, LoggerSupportData } from "./types";

function getQuerySearchParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
}

export function getLoggerQueryState(): {
    tabId: number | null;
    search: string;
    source: string | null;
    status: LoggerStatusFilter;
    review: LoggerReviewFilter;
} {
    const params = getQuerySearchParams();
    const rawTabId = params.get("tabId");
    const parsedTabId = rawTabId ? Number.parseInt(rawTabId, 10) : NaN;
    const status = params.get("status");
    const review = params.get("review");

    return {
        tabId: Number.isFinite(parsedTabId) ? parsedTabId : null,
        search: params.get("search") || "",
        source: params.get("source"),
        status: status === "blocked" || status === "modified" || status === "allowed" ? status : "all",
        review: review === "needs-review" ? "needs-review" : "all",
    };
}

export async function loadLoggerContext(): Promise<LoggerContext> {
    const query = getLoggerQueryState();
    const tab = query.tabId ? await getTabById(query.tabId) : await getActiveTab();
    const tabId = typeof tab?.id === "number" ? tab.id : query.tabId;

    let tabLabel = "No Tab Specified";
    if (tab) {
        if (tab.title) {
            tabLabel = tab.title;
        } else if (tab.url) {
            tabLabel = tab.url;
        } else {
            tabLabel = "Unknown Tab";
        }
    } else if (tabId) {
        tabLabel = "Tab securely closed or unavailable";
    }

    return {
        tabId: tabId ?? null,
        tabLabel,
        initialSearch: query.search,
        initialSource: query.source,
        initialStatus: query.status,
        initialReview: query.review,
    };
}

export async function loadLoggerEntries(tabId: number): Promise<LoggerLogSnapshot> {
    try {
        const response = await getNetworkLog(tabId);
        return {
            entries: response.entries.map(toLoggerEntry),
            sessionStartedAt: response.sessionStartedAt,
            lastUpdatedAt: response.lastUpdatedAt,
        };
    } catch {
        return {
            entries: [],
            sessionStartedAt: null,
            lastUpdatedAt: null,
        };
    }
}

function toLoggerEntry(entry: NetworkLogEntryResponse): LoggerEntry {
    return {
        ...entry,
        id: typeof entry.id === "number" ? entry.id : 0,
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
    };
}

export async function loadLoggerSupportData(): Promise<LoggerSupportData> {
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{
            networkBlocklist?: Array<string | { value?: string; enabled?: boolean }>;
            defaultBlocklist?: Array<string | { value?: string; enabled?: boolean }>;
        }>(["networkBlocklist", "defaultBlocklist"]),
        getLocal<{ networkBlocklistMeta?: LoggerSupportData["networkBlocklistMeta"] }>("networkBlocklistMeta"),
    ]);

    const normalize = (rules: Array<string | { value?: string; enabled?: boolean }> | undefined): string[] =>
        Array.isArray(rules)
            ? rules.flatMap((rule) => {
                if (typeof rule === "string") {
                    const normalized = rule.trim().toLowerCase();
                    return normalized ? [normalized] : [];
                }

                const value = typeof rule?.value === "string" ? rule.value.trim().toLowerCase() : "";
                return value && rule?.enabled !== false ? [value] : [];
            })
            : [];

    return {
        networkBlocklist: normalize(syncSnapshot.networkBlocklist),
        defaultBlocklist: normalize(getEffectiveDefaultBlocklistEntries(syncSnapshot.defaultBlocklist)),
        networkBlocklistMeta: normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta),
    };
}
