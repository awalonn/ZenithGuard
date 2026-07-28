export type AnalyzerViewState =
    | "idle"
    | "loading"
    | "report"
    | "error"
    | "quota-error"
    | "timeout-error"
    | "api-key-missing";

export type ObservedStatus = "blocked" | "seen" | undefined;
export type CoverageTone = "custom" | "built-in" | "observed" | undefined;

import type { NetworkLogEntryResponse } from "../../js/shared/runtime_messages";

export type AnalyzerFinding = {
    url: string;
    domain: string;
    description: string;
    evidenceLines: string[];
    evidenceCount: number;
    observedStatus?: ObservedStatus;
    isBlocked: boolean;
    blocklistCandidate?: string;
    coverageLabel?: string;
    coverageTone?: CoverageTone;
    matchedRuleValue?: string;
    isAdding?: boolean;
    isRemoving?: boolean;
    addError?: string;
    addInfo?: string;
};

export type AnalyzerCounts = {
    networkThreats: number;
    visualAnnoyances: number;
    heuristicIssues: number;
    darkPatterns: number;
};

export type AnalyzerFindingBuckets = {
    network: AnalyzerFinding[];
    visual: string[];
    heuristic: AnalyzerFinding[];
    darkPattern: string[];
};

export type AnalyzerObservedCounts = {
    blocked: number;
    seen: number;
};

export type AnalyzerNeedsAction = {
    needsAction: number;
};

export type AnalyzerObservedWindow = {
    sessionScope: string;
    sessionStartedAtLabel: string;
    lastUpdatedAtLabel: string;
};

export type AnalyzerReport = {
    counts: AnalyzerCounts;
    findings: AnalyzerFindingBuckets;
    grade: string;
    gradeLabel: string;
    executiveSummary: string;
    observedCounts: AnalyzerObservedCounts;
    observedWindow: AnalyzerObservedWindow;
    needsAction: AnalyzerNeedsAction;
};

export type AnalyzerRawResult = {
    networkThreats?: Array<{ url?: string; reason?: string }>;
    visualAnnoyances?: Array<{ description?: string }>;
    heuristicMatches?: Array<{ url?: string; keyword?: string }>;
    darkPatterns?: Array<{ patternName?: string; description?: string }>;
};

export type AnalyzerNetworkLogEntry = NetworkLogEntryResponse & {
    id: number;
};

export type AnalyzerNetworkLogSnapshot = {
    entries: AnalyzerNetworkLogEntry[];
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
};

export type AnalyzerBlocklistMeta = Record<string, {
    source?: string;
    addedAt?: number;
}>;

export type AnalyzerScanContext = {
    tabId: number | null;
    pageTitle: string;
    pageUrl: string | null;
    hostname: string;
    activeModel: string;
    apiKeyPresent: boolean;
};

export type AnalyzerScanOutcome = {
    state: AnalyzerViewState;
    report?: AnalyzerReport;
    errorMessage?: string;
    scanStatusMessage: string;
    context: AnalyzerScanContext;
};
