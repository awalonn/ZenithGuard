import type { AnalyzerScanContext, AnalyzerViewState } from "./types";

export type AnalyzerSupportDataChangeTransition = {
    invalidateActiveScan: boolean;
    clearReport: boolean;
    clearNeedsActionOnly: boolean;
    nextState: AnalyzerViewState;
    scanStatusMessage: string;
};

export function getAnalyzerContextKey(context: AnalyzerScanContext): string {
    return `${context.tabId ?? "none"}::${context.pageUrl ?? "none"}`;
}

export function hasAnalyzerPageChanged(previous: AnalyzerScanContext, next: AnalyzerScanContext): boolean {
    return getAnalyzerContextKey(previous) !== getAnalyzerContextKey(next);
}

export function shouldApplyAnalyzerOutcome(
    requestId: number,
    activeRequestId: number,
    startedContextKey: string,
    currentContextKey: string,
): boolean {
    return requestId === activeRequestId && startedContextKey === currentContextKey;
}

export function getAnalyzerSupportDataChangeTransition(state: AnalyzerViewState): AnalyzerSupportDataChangeTransition {
    if (state === "loading") {
        return {
            invalidateActiveScan: true,
            clearReport: true,
            clearNeedsActionOnly: true,
            nextState: "idle",
            scanStatusMessage: "Rules changed during the scan. Run it again when ready to refresh coverage for this page.",
        };
    }

    if (state === "report") {
        return {
            invalidateActiveScan: false,
            clearReport: false,
            clearNeedsActionOnly: false,
            nextState: "report",
            scanStatusMessage: "Rules changed. Current report was kept; rescan only when you want refreshed coverage.",
        };
    }

    return {
        invalidateActiveScan: false,
        clearReport: false,
        clearNeedsActionOnly: false,
        nextState: state,
        scanStatusMessage: "",
    };
}
