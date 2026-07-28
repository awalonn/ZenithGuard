import type { RuleFamily } from "../../js/background/modules/network_logger/network_log_analytics";
import type { NetworkLogEntryResponse } from "../../js/shared/runtime_messages";

export type LoggerStatusFilter = "all" | "blocked" | "modified" | "allowed";
export type LoggerReviewFilter = "all" | "needs-review";

export type LoggerMatchedRuleInfo = NonNullable<NetworkLogEntryResponse["matchedRuleInfo"]>;

export type LoggerEntry = NetworkLogEntryResponse & {
    id: number;
    timestamp: number;
};

export type LoggerContext = {
    tabId: number | null;
    tabLabel: string;
    initialSearch: string;
    initialSource: string | null;
    initialStatus: LoggerStatusFilter;
    initialReview: LoggerReviewFilter;
};

export type LoggerLogSnapshot = {
    entries: LoggerEntry[];
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
};

export type LoggerSupportData = {
    networkBlocklist: string[];
    defaultBlocklist: string[];
    networkBlocklistMeta: Record<string, { source?: string; addedAt?: number }>;
};

export type LoggerFilterState = {
    search: string;
    status: LoggerStatusFilter;
    review: LoggerReviewFilter;
    family: "all" | RuleFamily;
    source: string | null;
};

export type LoggerStatSummary = {
    session: string;
    sessionScope: string;
    sessionStartedAtLabel: string;
    lastUpdatedAtLabel: string;
    blocked: number;
    modified: number;
    allowed: number;
    visible: number;
};

export type LoggerActiveFilterTag = {
    id: string;
    label: string;
};

export type LoggerVisibleEntry = LoggerEntry & {
    domain: string | null;
    initiatorDomain: string | null;
    family: RuleFamily;
    customOriginLabel: string | null;
    customMatchedValue: string | null;
    customBlockCandidate: string | null;
    reviewReason: string | null;
    needsReview: boolean;
    canAddCustomBlock: boolean;
};
