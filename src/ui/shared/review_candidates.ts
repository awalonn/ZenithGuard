import { hostnamesMatch } from "../../js/shared/hostname_matching";
import { getAdTechReviewReason } from "./ad_tech_signals";

export type ReviewCandidateInput = {
    url: string;
    status: string;
    type?: string;
    initiator?: string;
    domain?: string | null;
    candidate?: string | null;
    reason?: string | null;
    timestamp?: number;
};

export type ReviewCandidateSummary = {
    domain: string;
    candidate: string;
    type: string;
    reason: string;
    timestamp: number;
};

function getUrlHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function getInitiatorHostname(initiator?: string): string {
    return initiator ? getUrlHostname(initiator) : "";
}

function isThirdPartyRequest(entry: ReviewCandidateInput, pageHostname?: string): boolean {
    const requestHostname = entry.domain || getUrlHostname(entry.url);
    const initiatorHostname = getInitiatorHostname(entry.initiator);
    const comparisonHostname = pageHostname || initiatorHostname;

    return Boolean(
        requestHostname
        && comparisonHostname
        && !hostnamesMatch(requestHostname, comparisonHostname)
        && !hostnamesMatch(comparisonHostname, requestHostname),
    );
}

function formatCandidateFilter(candidate: string | null | undefined, domain: string): string {
    const trimmed = String(candidate || "").trim();
    if (trimmed.startsWith("||") || trimmed.includes("/") || trimmed.includes("*")) {
        return trimmed;
    }

    const value = trimmed || (domain !== "unknown domain" ? domain : "");
    return value ? `||${value}^` : domain;
}

export function getReviewCandidateReason(entry: ReviewCandidateInput, pageHostname?: string): string | null {
    if (entry.status !== "allowed" || !isThirdPartyRequest(entry, pageHostname)) {
        return null;
    }

    const requestHostname = entry.domain || getUrlHostname(entry.url);
    return entry.reason || getAdTechReviewReason(`${requestHostname} ${entry.url}`);
}

export function getReviewCandidateDomain(entry: ReviewCandidateInput): string {
    return entry.domain || getUrlHostname(entry.url) || "unknown domain";
}

export function toReviewCandidateSummary(
    entry: ReviewCandidateInput,
    pageHostname?: string,
    includeUnclassified = false,
): ReviewCandidateSummary | null {
    const reason = getReviewCandidateReason(entry, pageHostname)
        || (includeUnclassified && entry.status === "allowed" && isThirdPartyRequest(entry, pageHostname)
            ? "Allowed uncovered third-party request"
            : null);
    if (!reason) {
        return null;
    }

    const domain = getReviewCandidateDomain(entry);
    return {
        domain,
        candidate: formatCandidateFilter(entry.candidate, domain),
        type: entry.type || "unknown",
        reason,
        timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
    };
}

export function selectReviewCandidateSummaries(
    entries: ReviewCandidateInput[],
    pageHostname?: string,
    limit = 12,
    includeUnclassified = false,
): ReviewCandidateSummary[] {
    return entries
        .map((entry) => toReviewCandidateSummary(entry, pageHostname, includeUnclassified))
        .filter((entry): entry is ReviewCandidateSummary => Boolean(entry))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, limit);
}

export function buildRedactedReviewCandidateList(
    entries: ReviewCandidateInput[],
    options: {
        pageHostname?: string;
        tabLabel?: string;
        tabId?: number | null;
        limit?: number;
        includeUnclassified?: boolean;
    } = {},
): string {
    const candidates = selectReviewCandidateSummaries(
        entries,
        options.pageHostname,
        options.limit ?? 12,
        options.includeUnclassified === true,
    );
    return [
        "ZenithGuard Review Candidates",
        `Generated: ${new Date().toISOString()}`,
        "",
        "Page",
        `- Hostname: ${options.pageHostname || options.tabLabel || "Current tab"}`,
        `- Tab ID: ${options.tabId ?? "unavailable"}`,
        "",
        "Candidates",
        candidates.length > 0
            ? candidates.map((entry) => [
                `- ${entry.domain}`,
                ` | candidate: ${entry.candidate}`,
                ` | type: ${entry.type}`,
                ` | reason: ${entry.reason}`,
            ].join("")).join("\n")
            : "- none",
        "",
        "Notes",
        "- This list is redacted for quick sharing. Open Logger Review for full request URLs and timing.",
    ].join("\n");
}
