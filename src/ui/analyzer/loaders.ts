import { getActiveTab, getTabById } from "../../js/shared/browser";
import { getNetworkLog } from "../../js/shared/runtime_messages";
import type { NetworkLogEntryResponse } from "../../js/shared/runtime_messages";
import { getLocal, getSync } from "../../js/shared/storage_api";
import { resolveGeminiModel } from "../../js/background/modules/ai/config";
import { getEffectiveDefaultBlocklistEntries } from "../../js/background/modules/storage/defaults";
import { normalizeNetworkBlocklistMetaRecord } from "../../js/shared/network_blocklist_meta";
import type { AnalyzerBlocklistMeta, AnalyzerNetworkLogEntry, AnalyzerNetworkLogSnapshot, AnalyzerScanContext } from "./types";

export async function loadAnalyzerContext(tabIdFromQuery?: number | null): Promise<AnalyzerScanContext> {
    const [activeTab, modelSnapshot, apiKeySnapshot] = await Promise.all([
        tabIdFromQuery ? getTabById(tabIdFromQuery) : getActiveTab(),
        getSync<{ geminiModel?: string; geminiModelOverride?: string }>(["geminiModel", "geminiModelOverride"]),
        getLocal<{ geminiApiKey?: string }>("geminiApiKey"),
    ]);

    const tabId = typeof activeTab?.id === "number" ? activeTab.id : null;
    const pageUrl = activeTab?.url || null;
    let hostname = "Ready to scan a browser tab";

    if (pageUrl) {
        try {
            const parsed = new URL(pageUrl);
            hostname = parsed.hostname || parsed.href;
        } catch {
            hostname = activeTab?.title || hostname;
        }
    }

    return {
        tabId,
        pageTitle: activeTab?.title || "AI Page Analyzer",
        pageUrl,
        hostname,
        activeModel: resolveGeminiModel(modelSnapshot.geminiModel, modelSnapshot.geminiModelOverride),
        apiKeyPresent: Boolean(apiKeySnapshot.geminiApiKey),
    };
}

export async function loadAnalyzerSupportData(): Promise<{
    networkBlocklist: string[];
    defaultBlocklist: string[];
    networkBlocklistMeta: AnalyzerBlocklistMeta;
}> {
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{ networkBlocklist?: Array<string | { value: string; enabled?: boolean }>; defaultBlocklist?: Array<string | { value: string; enabled?: boolean }> }>([
            "networkBlocklist",
            "defaultBlocklist",
        ]),
        getLocal<{ networkBlocklistMeta?: AnalyzerBlocklistMeta }>("networkBlocklistMeta"),
    ]);

    const normalizeRules = (rules: Array<string | { value: string; enabled?: boolean }> | undefined) => Array.isArray(rules)
        ? rules.flatMap((rule) => {
            if (typeof rule === "string" && rule.trim()) {
                return [rule.trim().toLowerCase()];
            }
            if (rule && typeof rule === "object" && rule.enabled !== false && typeof rule.value === "string" && rule.value.trim()) {
                return [rule.value.trim().toLowerCase()];
            }
            return [];
        })
        : [];

    return {
        networkBlocklist: normalizeRules(syncSnapshot.networkBlocklist),
        defaultBlocklist: normalizeRules(getEffectiveDefaultBlocklistEntries(syncSnapshot.defaultBlocklist)),
        networkBlocklistMeta: normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta),
    };
}

export async function loadAnalyzerNetworkLog(tabId: number): Promise<AnalyzerNetworkLogSnapshot> {
    try {
        const response = await getNetworkLog(tabId);
        return {
            entries: response.entries.map(toAnalyzerNetworkLogEntry),
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

function toAnalyzerNetworkLogEntry(entry: NetworkLogEntryResponse): AnalyzerNetworkLogEntry {
    return {
        ...entry,
        id: typeof entry.id === "number" ? entry.id : 0,
    };
}
