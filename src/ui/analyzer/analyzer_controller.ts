import { addToNetworkBlocklist, analyzePageWithAi, sendMessage } from "../../js/shared/runtime_messages";
import { normalizeDomain } from "../../js/background/modules/storage/defaults";
import { openLoggerPage, openSettingsPage } from "../../js/shared/browser";
import { findMatchingRecordValue, hostnamesMatch } from "../../js/shared/hostname_matching";
import {
    getCanonicalNetworkBlockMetaKey,
    normalizeNetworkBlocklistMetaRecord,
} from "../../js/shared/network_blocklist_meta";
import { getLocal, getSync, setLocal, setSync } from "../../js/shared/storage_api";
import { getAdTechReviewReason } from "../shared/ad_tech_signals";
import { loadAnalyzerNetworkLog, loadAnalyzerSupportData } from "./loaders";
import type {
    AnalyzerBlocklistMeta,
    AnalyzerCounts,
    AnalyzerFinding,
    AnalyzerFindingBuckets,
    AnalyzerNeedsAction,
    AnalyzerNetworkLogEntry,
    AnalyzerNetworkLogSnapshot,
    AnalyzerObservedCounts,
    AnalyzerObservedWindow,
    AnalyzerRawResult,
    AnalyzerReport,
    AnalyzerScanContext,
    AnalyzerScanOutcome,
} from "./types";

function formatObservedWindowTime(timestamp: number | null): string {
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

function buildObservedWindow(networkLogSnapshot: AnalyzerNetworkLogSnapshot): AnalyzerObservedWindow {
    const sessionStartedAtLabel = formatObservedWindowTime(networkLogSnapshot.sessionStartedAt);
    const lastUpdatedAtLabel = formatObservedWindowTime(networkLogSnapshot.lastUpdatedAt);

    return {
        sessionScope: sessionStartedAtLabel
            ? `Observed traffic from the current page load since ${sessionStartedAtLabel}`
            : "Observed traffic from the current page load",
        sessionStartedAtLabel,
        lastUpdatedAtLabel,
    };
}

function getHostname(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const sanitizeHostnameCandidate = (candidate: string | null): string | null => {
        if (!candidate) {
            return null;
        }

        const wildcardStripped = candidate.trim().toLowerCase().replace(/^(?:%2a|\*)\./i, "");
        if (!wildcardStripped) {
            return null;
        }

        return normalizeDomain(wildcardStripped) || wildcardStripped;
    };

    try {
        return sanitizeHostnameCandidate(new URL(trimmed).hostname);
    } catch {
        const decoded = (() => {
            try {
                return decodeURIComponent(trimmed);
            } catch {
                return trimmed;
            }
        })();

        for (const candidate of [trimmed, decoded]) {
            const normalized = sanitizeHostnameCandidate(normalizeDomain(candidate));
            if (normalized) {
                return normalized;
            }

            const matches = candidate.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) || [];
            for (const match of matches) {
                const normalizedMatch = sanitizeHostnameCandidate(normalizeDomain(match) || match);
                if (normalizedMatch) {
                    return normalizedMatch;
                }
            }
        }

        return null;
    }
}

function normalizeRuleValues(rules: string[]): string[] {
    const normalized = new Set<string>();
    for (const rule of rules) {
        const candidate = normalizeDomain(rule) || rule.trim().toLowerCase();
        if (candidate) {
            normalized.add(candidate);
        }
    }
    return Array.from(normalized);
}

function isHostnameMatch(hostname: string, ruleValue: string): boolean {
    return hostnamesMatch(hostname, ruleValue);
}

function getCoverageLabel(source?: string): string {
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

function getCoverageState(
    hostname: string,
    observedStatuses: Map<string, "blocked" | "seen">,
    networkBlocklist: string[],
    defaultBlocklist: string[],
    blocklistMeta: AnalyzerBlocklistMeta,
): Pick<AnalyzerFinding, "isBlocked" | "coverageLabel" | "coverageTone" | "matchedRuleValue"> {
    if (!hostname) {
        return { isBlocked: false };
    }

    for (const rule of networkBlocklist) {
        if (isHostnameMatch(hostname, rule)) {
            const matchingMeta = findMatchingRecordValue(blocklistMeta, rule);
            return {
                isBlocked: true,
                coverageLabel: getCoverageLabel(matchingMeta?.source),
                coverageTone: "custom",
                matchedRuleValue: rule,
            };
        }
    }

    for (const rule of defaultBlocklist) {
        if (isHostnameMatch(hostname, rule)) {
            return {
                isBlocked: true,
                coverageLabel: "Built-in rule",
                coverageTone: "built-in",
                matchedRuleValue: rule,
            };
        }
    }

    if (observedStatuses.get(hostname) === "blocked") {
        return {
            isBlocked: true,
            coverageLabel: "Blocked on page",
            coverageTone: "observed",
        };
    }

    return { isBlocked: false };
}

function getObservedStatuses(networkLog: AnalyzerNetworkLogEntry[]): Map<string, "blocked" | "seen"> {
    const statuses = new Map<string, "blocked" | "seen">();
    for (const entry of networkLog) {
        const hostname = getHostname(entry.url);
        if (!hostname) {
            continue;
        }

        if (entry.status === "blocked") {
            statuses.set(hostname, "blocked");
            continue;
        }

        if (!statuses.has(hostname)) {
            statuses.set(hostname, "seen");
        }
    }
    return statuses;
}

function getObservedStatusLabel(status?: "blocked" | "seen"): AnalyzerFinding["observedStatus"] {
    if (status === "blocked") {
        return "blocked";
    }
    if (status === "seen") {
        return "seen";
    }
    return undefined;
}

function isThirdPartyNetworkLogEntry(entry: AnalyzerNetworkLogEntry): boolean {
    if (!entry.initiator) {
        return true;
    }

    const requestHostname = getHostname(entry.url);
    const initiatorHostname = getHostname(entry.initiator);
    if (!requestHostname || !initiatorHostname) {
        return true;
    }

    return !hostnamesMatch(requestHostname, initiatorHostname) && !hostnamesMatch(initiatorHostname, requestHostname);
}

function getObservedAdTechReason(entry: AnalyzerNetworkLogEntry): string | null {
    if (entry.status !== "allowed") {
        return null;
    }

    if (!isThirdPartyNetworkLogEntry(entry)) {
        return null;
    }

    const hostname = getHostname(entry.url) || "";
    return getAdTechReviewReason(`${hostname} ${entry.url}`);
}

function getEvidenceRank(text: string): number {
    const normalized = text.toLowerCase();
    if (normalized.includes("blocked threat") || normalized.includes("verified blocked")) {
        return 4;
    }
    if (normalized.includes("pixel") || normalized.includes("telemetry") || normalized.includes("fingerprint")) {
        return 3;
    }
    if (normalized.includes("matched keyword")) {
        return 2;
    }
    return 1;
}

function getFindingRank(finding: AnalyzerFinding): number {
    let rank = 0;
    if (finding.domain) rank += 4;
    if (finding.isBlocked) {
        rank += finding.coverageTone === "custom" ? 3 : 1;
    } else {
        rank += 6;
    }
    if (finding.observedStatus === "blocked") {
        rank += 4;
    } else if (finding.observedStatus === "seen") {
        rank += 2;
    }
    if (finding.matchedRuleValue) {
        rank += 1;
    }
    return rank;
}

function compareFindings(left: AnalyzerFinding, right: AnalyzerFinding): number {
    const leftRank = getFindingRank(left);
    const rightRank = getFindingRank(right);
    if (leftRank !== rightRank) {
        return rightRank - leftRank;
    }

    const leftEvidence = getEvidenceRank(left.description);
    const rightEvidence = getEvidenceRank(right.description);
    if (leftEvidence !== rightEvidence) {
        return rightEvidence - leftEvidence;
    }

    return (left.domain || left.url || left.description).localeCompare(right.domain || right.url || right.description);
}

function mergeObservedStatus(
    left: AnalyzerFinding["observedStatus"],
    right: AnalyzerFinding["observedStatus"],
): AnalyzerFinding["observedStatus"] {
    if (left === "blocked" || right === "blocked") {
        return "blocked";
    }
    if (left === "seen" || right === "seen") {
        return "seen";
    }
    return undefined;
}

function dedupeFindings(findings: AnalyzerFinding[]): AnalyzerFinding[] {
    const byKey = new Map<string, AnalyzerFinding>();

    for (const finding of findings) {
        const key = finding.domain || finding.url || finding.description;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...finding });
            continue;
        }

        const evidence = new Set(existing.evidenceLines || [existing.description]);
        for (const line of finding.evidenceLines || [finding.description]) {
            if (line) {
                evidence.add(line);
            }
        }

        existing.evidenceLines = Array.from(evidence).sort((a, b) => getEvidenceRank(b) - getEvidenceRank(a));
        existing.evidenceCount = existing.evidenceLines.length;
        existing.description = existing.evidenceLines[0] || existing.description;
        existing.isBlocked = existing.isBlocked || finding.isBlocked;
        existing.coverageLabel = existing.coverageLabel || finding.coverageLabel;
        existing.coverageTone = existing.coverageTone || finding.coverageTone;
        existing.matchedRuleValue = existing.matchedRuleValue || finding.matchedRuleValue;
        existing.observedStatus = mergeObservedStatus(existing.observedStatus, finding.observedStatus);
    }

    return Array.from(byKey.values()).sort(compareFindings);
}

function createFinding(
    url: string,
    reason: string,
    observedStatuses: Map<string, "blocked" | "seen">,
    networkBlocklist: string[],
    defaultBlocklist: string[],
    blocklistMeta: AnalyzerBlocklistMeta,
): AnalyzerFinding {
    const domain = getHostname(url) || "";
    const blocklistCandidate = domain ? normalizeDomain(domain) || domain : undefined;
    const coverage = getCoverageState(domain, observedStatuses, networkBlocklist, defaultBlocklist, blocklistMeta);

    return {
        url,
        domain,
        blocklistCandidate,
        description: `${url} - ${reason}`,
        evidenceLines: [`${url} - ${reason}`],
        evidenceCount: 1,
        observedStatus: domain ? getObservedStatusLabel(observedStatuses.get(domain)) : undefined,
        ...coverage,
    };
}

function createObservedAdTechFindings(
    networkLog: AnalyzerNetworkLogEntry[],
    observedStatuses: Map<string, "blocked" | "seen">,
    networkBlocklist: string[],
    defaultBlocklist: string[],
    blocklistMeta: AnalyzerBlocklistMeta,
): AnalyzerFinding[] {
    return networkLog
        .flatMap((entry) => {
            const reason = getObservedAdTechReason(entry);
            return reason ? [
                createFinding(
                    entry.url,
                    reason,
                    observedStatuses,
                    networkBlocklist,
                    defaultBlocklist,
                    blocklistMeta,
                ),
            ] : [];
        })
        .filter((finding) => finding.domain && !finding.isBlocked);
}

function getObservedCounts(network: AnalyzerFinding[], heuristic: AnalyzerFinding[]): AnalyzerObservedCounts {
    const statuses = new Map<string, AnalyzerFinding["observedStatus"]>();
    for (const finding of [...network, ...heuristic]) {
        const key = finding.domain || finding.url;
        if (!key) continue;
        statuses.set(key, mergeObservedStatus(statuses.get(key), finding.observedStatus));
    }

    let blocked = 0;
    let seen = 0;
    for (const status of statuses.values()) {
        if (status === "blocked") blocked += 1;
        else if (status === "seen") seen += 1;
    }

    return { blocked, seen };
}

function getNeedsAction(network: AnalyzerFinding[], heuristic: AnalyzerFinding[]): AnalyzerNeedsAction {
    const actionable = new Set<string>();
    for (const finding of [...network, ...heuristic]) {
        if (!finding.domain || finding.isBlocked) {
            continue;
        }
        actionable.add(finding.domain);
    }
    return { needsAction: actionable.size };
}

function getGrade(totalFindings: number): string {
    if (totalFindings === 0) return "A";
    if (totalFindings <= 5) return "B";
    if (totalFindings <= 10) return "C";
    return "D";
}

function getGradeLabel(grade: string): string {
    switch (grade) {
        case "A": return "Low exposure";
        case "B": return "Mild concerns";
        case "C": return "Moderate risk";
        default: return "High-risk patterns";
    }
}

function getExecutiveSummary(totalFindings: number): string {
    return totalFindings === 0
        ? "This page looks unusually clean. No tracker-heavy or manipulative patterns were detected in the current scan."
        : `ZenithGuard found ${totalFindings} signal${totalFindings === 1 ? "" : "s"} worth reviewing across network behavior, visual clutter, heuristics, and dark patterns.`;
}

export function buildReport(
    rawResult: AnalyzerRawResult,
    networkLogInput: AnalyzerNetworkLogEntry[] | AnalyzerNetworkLogSnapshot,
    supportData: Awaited<ReturnType<typeof loadAnalyzerSupportData>>,
): AnalyzerReport {
    const networkLogSnapshot = Array.isArray(networkLogInput)
        ? {
            entries: networkLogInput,
            sessionStartedAt: null,
            lastUpdatedAt: null,
        }
        : networkLogInput;
    const networkLog = networkLogSnapshot.entries;
    const observedStatuses = getObservedStatuses(networkLog);
    const networkBlocklist = normalizeRuleValues(supportData.networkBlocklist);
    const defaultBlocklist = normalizeRuleValues(supportData.defaultBlocklist);
    const blocklistMeta = supportData.networkBlocklistMeta;

    const network = dedupeFindings([
        ...(rawResult.networkThreats || []).map((entry) =>
            createFinding(entry.url || "unknown", entry.reason || "Tracker", observedStatuses, networkBlocklist, defaultBlocklist, blocklistMeta),
        ),
        ...createObservedAdTechFindings(networkLog, observedStatuses, networkBlocklist, defaultBlocklist, blocklistMeta),
    ]);

    const visual = (rawResult.visualAnnoyances || []).map((entry) => entry.description || "Visual Ad");

    const heuristic = dedupeFindings((rawResult.heuristicMatches || []).map((entry) =>
        createFinding(
            entry.url || "unknown",
            `Matched keyword '${entry.keyword || ""}'`,
            observedStatuses,
            networkBlocklist,
            defaultBlocklist,
            blocklistMeta,
        ),
    ));

    const darkPattern = (rawResult.darkPatterns || []).map((entry) => `${entry.patternName || "Pattern"}: ${entry.description || ""}`);

    const counts: AnalyzerCounts = {
        networkThreats: network.length,
        visualAnnoyances: visual.length,
        heuristicIssues: heuristic.length,
        darkPatterns: darkPattern.length,
    };

    const totalFindings = counts.networkThreats + counts.visualAnnoyances + counts.heuristicIssues + counts.darkPatterns;
    const grade = getGrade(totalFindings);

    return {
        counts,
        findings: { network, visual, heuristic, darkPattern },
        grade,
        gradeLabel: getGradeLabel(grade),
        executiveSummary: getExecutiveSummary(totalFindings),
        observedCounts: getObservedCounts(network, heuristic),
        observedWindow: buildObservedWindow(networkLogSnapshot),
        needsAction: getNeedsAction(network, heuristic),
    };
}

export async function runAnalyzerScan(context: AnalyzerScanContext): Promise<AnalyzerScanOutcome> {
    if (!context.apiKeyPresent) {
        return {
            state: "api-key-missing",
            scanStatusMessage: "",
            context,
        };
    }

    if (!context.tabId || !context.pageUrl) {
        return {
            state: "error",
            errorMessage: "Cannot determine which browser tab should be scanned.",
            scanStatusMessage: "",
            context,
        };
    }

    try {
        const [analysisResponse, networkLog, supportData] = await Promise.all([
            analyzePageWithAi<AnalyzerRawResult>(context.tabId, context.pageUrl),
            loadAnalyzerNetworkLog(context.tabId),
            loadAnalyzerSupportData(),
        ]);

        if (!analysisResponse?.success || !analysisResponse.result) {
            const error = analysisResponse?.error || "Unknown error during analysis.";
            if (error === "QUOTA_EXCEEDED" || error.includes("429")) {
                return { state: "quota-error", scanStatusMessage: "", context };
            }
            if (error === "AI_TIMEOUT") {
                return {
                    state: "timeout-error",
                    errorMessage: "Gemini took too long to finish this scan. Retry once, or try again after reloading the page if it is very heavy.",
                    scanStatusMessage: "",
                    context,
                };
            }
            if (error.includes("Gemini API key is not set")) {
                return { state: "api-key-missing", scanStatusMessage: "", context };
            }
            return {
                state: "error",
                errorMessage: error,
                scanStatusMessage: "",
                context,
            };
        }

        return {
            state: "report",
            report: buildReport(analysisResponse.result, networkLog, supportData),
            scanStatusMessage: "",
            context,
        };
    } catch (error) {
        return {
            state: "error",
            errorMessage: error instanceof Error ? error.message : String(error),
            scanStatusMessage: "",
            context,
        };
    }
}

export async function openAnalyzerSettings(): Promise<void> {
    await openSettingsPage({ section: "general-settings" });
}

export async function openFindingInLogger(tabId: number, finding: AnalyzerFinding): Promise<void> {
    if (!finding.domain) {
        return;
    }

    await openLoggerPage({
        tabId,
        search: finding.domain,
    });
}

export async function manageFindingInRules(finding: AnalyzerFinding): Promise<void> {
    if (!finding.domain) {
        return;
    }

    await openSettingsPage({
        section: "my-rules",
        domain: finding.domain,
        focus: "network-blocklist",
    });
}

export async function addFindingToBlocklist(finding: AnalyzerFinding): Promise<{ success: boolean; status: "added" | "existing" | "failed"; message?: string }> {
    const candidate = finding.blocklistCandidate || finding.domain;
    if (!candidate) {
        return { success: false, status: "failed", message: "No domain available for this finding." };
    }

    const response = await addToNetworkBlocklist(candidate, "analyzer");
    if (response.message === "Rule already exists.") {
        return { success: true, status: "existing", message: response.message };
    }

    return {
        success: response.success === true,
        status: response.success === true ? "added" : "failed",
        message: response.message,
    };
}

export async function removeFindingFromCustomBlocklist(finding: AnalyzerFinding): Promise<void> {
    if (!finding.matchedRuleValue) {
        return;
    }

    const matchedRuleKey = getCanonicalNetworkBlockMetaKey(finding.matchedRuleValue);
    const [syncSnapshot, localSnapshot] = await Promise.all([
        getSync<{ networkBlocklist?: Array<string | { value?: string; enabled?: boolean }> }>("networkBlocklist"),
        getLocal<{ networkBlocklistMeta?: AnalyzerBlocklistMeta }>("networkBlocklistMeta"),
    ]);

    const nextBlocklist = Array.isArray(syncSnapshot.networkBlocklist)
        ? syncSnapshot.networkBlocklist.filter((rule) => {
            const value = typeof rule === "string" ? rule : String(rule?.value || "");
            return getCanonicalNetworkBlockMetaKey(value) !== matchedRuleKey;
        })
        : [];

    const nextMeta = normalizeNetworkBlocklistMetaRecord(localSnapshot.networkBlocklistMeta);
    delete nextMeta[matchedRuleKey];

    await Promise.all([
        setSync({ networkBlocklist: nextBlocklist }),
        setLocal({ networkBlocklistMeta: nextMeta }),
        sendMessage({ type: "APPLY_ALL_RULES" }).catch(() => {}),
    ]);
}
