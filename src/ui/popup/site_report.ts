import {
    buildRedactedReviewCandidateList,
    getReviewCandidateReason,
    selectReviewCandidateSummaries,
} from "../shared/review_candidates";
import type { PopupNetworkLog, PopupReviewCandidateSummary, PopupSnapshot, SitePolicyState, ToolActivityEntry } from "./types";

function truncate(value: string, maxLength: number): string {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatTimestamp(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return "unknown time";
    }

    return new Date(timestamp).toISOString();
}

function formatRuleInfo(entry: PopupNetworkLog): string {
    const parts = [
        entry.matchedRuleInfo?.source,
        entry.matchedRuleInfo?.category,
        entry.matchedRuleInfo?.matchedValue,
        entry.matchedRuleInfo?.detail,
    ]
        .map((part) => String(part || "").trim())
        .filter(Boolean);

    return parts.length > 0 ? ` | rule: ${truncate(parts.join(" / "), 160)}` : "";
}

function formatNetworkEntry(entry: PopupNetworkLog): string {
    return [
        `- ${entry.status.toUpperCase()}`,
        entry.type ? ` ${entry.type}` : "",
        ` ${truncate(entry.url, 180)}`,
        formatRuleInfo(entry),
        ` | ${formatTimestamp(entry.timestamp)}`,
    ].join("");
}

function selectRecentNetworkEntries(entries: PopupNetworkLog[], limit: number): PopupNetworkLog[] {
    return [...entries]
        .filter((entry) => entry.status === "blocked" || entry.status === "modified" || entry.status === "allowed")
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, limit);
}

function getUrlHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function getReviewReason(entry: PopupNetworkLog, pageHostname: string): string | null {
    return getReviewCandidateReason(entry, pageHostname);
}

function formatReviewCandidate(entry: PopupNetworkLog, pageHostname: string): string {
    const requestHostname = getUrlHostname(entry.url) || "unknown domain";
    return [
        `- ${requestHostname}`,
        ` | candidate: ||${requestHostname}^`,
        ` | type: ${entry.type || "unknown"}`,
        ` | reason: ${getReviewReason(entry, pageHostname) || "Allowed uncovered third-party request"}`,
        ` | url: ${truncate(entry.url, 180)}`,
    ].join("");
}

function selectReviewCandidates(entries: PopupNetworkLog[], pageHostname: string, limit: number): PopupNetworkLog[] {
    return [...entries]
        .filter((entry) => Boolean(getReviewReason(entry, pageHostname)))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, limit);
}

export function countReviewCandidates(entries: PopupNetworkLog[], pageHostname: string): number {
    return entries.filter((entry) => Boolean(getReviewReason(entry, pageHostname))).length;
}

export function getReviewCandidateSummaries(
    entries: PopupNetworkLog[],
    pageHostname: string,
    limit = 3,
): PopupReviewCandidateSummary[] {
    return selectReviewCandidateSummaries(entries, pageHostname, limit).map((entry) => ({
        domain: entry.domain,
        type: entry.type,
        reason: entry.reason,
    }));
}

export function buildReviewCandidateList(snapshot: PopupSnapshot, limit = 12): string {
    return buildRedactedReviewCandidateList(snapshot.networkLog, {
        pageHostname: snapshot.hostname,
        tabId: snapshot.tabId,
        limit,
    });
}

export function buildSiteReportPackage(
    snapshot: PopupSnapshot,
    policy: SitePolicyState,
    toolActivity: ToolActivityEntry[] = [],
): string {
    const blockedCount = snapshot.networkLog.filter((entry) => entry.status === "blocked").length;
    const modifiedCount = snapshot.networkLog.filter((entry) => entry.status === "modified").length;
    const allowedCount = snapshot.networkLog.filter((entry) => entry.status === "allowed").length;
    const recentNetwork = selectRecentNetworkEntries(snapshot.networkLog, 12);
    const reviewCandidates = selectReviewCandidates(snapshot.networkLog, snapshot.hostname, 8);
    const recentActivity = toolActivity
        .slice(0, 6)
        .map((entry) => `- ${entry.tool}: ${entry.title} | ${truncate(entry.message, 160)} | ${formatTimestamp(entry.timestamp)}`);

    return [
        "ZenithGuard Site Report",
        `Generated: ${new Date().toISOString()}`,
        "",
        "Page",
        `- Hostname: ${snapshot.hostname}`,
        `- URL: ${snapshot.pageUrl || "unavailable"}`,
        `- Tab ID: ${snapshot.tabId ?? "unavailable"}`,
        "",
        "Issue",
        "- What I saw: ",
        "- What I clicked before it happened: ",
        "",
        "Protection State",
        `- Global protection: ${policy.isProtectionEnabled ? "on" : "off"}`,
        `- Site protection: ${policy.isSiteProtectionEnabled ? "on" : "paused"}`,
        `- Isolation mode: ${policy.isIsolationModeEnabled ? "on" : "off"}`,
        `- Forgetful browsing: ${policy.isForgetfulBrowsingEnabled ? "on" : "off"}`,
        `- Focus mode: ${policy.focusModeActive ? policy.focusModeUntilText || "active" : "off"}`,
        `- Data breach warnings: ${snapshot.settings.isBreachWarningEnabled ? "on" : "off"}`,
        `- Custom hidden rules: ${policy.hiddenRuleCount}`,
        `- Temporary wall fix: ${policy.hasTemporaryWallFix ? "yes" : "no"}`,
        `- Saved wall fix: ${policy.hasSavedWallFix ? "yes" : "no"}`,
        "",
        "Counts",
        `- Blocked requests: ${blockedCount}`,
        `- Modified requests: ${modifiedCount}`,
        `- Allowed requests: ${allowedCount}`,
        `- Trackers detected: ${snapshot.privacyStats.trackersDetected || 0}`,
        `- Trackers blocked: ${snapshot.privacyStats.trackersBlocked || 0}`,
        `- Recent AI scan: ${snapshot.hasRecentAiScan ? "yes" : "no"}`,
        "",
        "Recent Tool Activity",
        recentActivity.length > 0 ? recentActivity.join("\n") : "- none",
        "",
        "Review Candidates",
        reviewCandidates.length > 0
            ? reviewCandidates.map((entry) => formatReviewCandidate(entry, snapshot.hostname)).join("\n")
            : "- none",
        "",
        "Recent Network Decisions",
        recentNetwork.length > 0 ? recentNetwork.map(formatNetworkEntry).join("\n") : "- none",
        "",
        "Notes",
        "- Paste this report with your description of the visible issue.",
    ].join("\n");
}
