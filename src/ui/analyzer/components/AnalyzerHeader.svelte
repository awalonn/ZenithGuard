<script lang="ts">
    import type { AnalyzerScanContext, AnalyzerViewState } from "../types";

    export let context: AnalyzerScanContext;
    export let state: AnalyzerViewState;
    export let totalFindings = 0;
    export let riskLabel = "Waiting for scan";
    export let scanStatusMessage = "";
    export let startScan: () => Promise<void>;

    function getStateLabel(viewState: AnalyzerViewState): string {
        switch (viewState) {
            case "report":
                return "Report ready";
            case "loading":
                return "Scanning now";
            case "idle":
                return "Ready to scan";
            case "api-key-missing":
                return "Gemini key required";
            case "quota-error":
                return "Quota limit reached";
            case "timeout-error":
                return "AI timed out";
            default:
                return "Scan unavailable";
        }
    }
</script>

<header class="analyzer-header">
    <div class="eyebrow">ZenithGuard AI report</div>
    <h1 class="analyzer-title">AI Page Analyzer</h1>
    <p class="analyzer-subtitle">{context.hostname}</p>
    <p class="analyzer-intro">Run one focused scan of the active tab to combine network signals, visual clutter, heuristic matches, and manipulative UX findings into a single page report.</p>

    <div class="analyzer-status-strip">
        <div class="analyzer-status-chip"><span class="analyzer-status-label">Scan State</span><strong>{getStateLabel(state)}</strong></div>
        <div class="analyzer-status-chip"><span class="analyzer-status-label">Risk Label</span><strong>{state === "report" ? riskLabel : "Waiting for scan"}</strong></div>
        <div class="analyzer-status-chip"><span class="analyzer-status-label">Findings</span><strong>{state === "report" ? totalFindings : 0}</strong></div>
    </div>

    <div class="analyzer-actions">
        <button id="start-scan-btn" class="btn-apply-all" on:click={startScan} disabled={state === "loading"}>
            {#if state === "loading"}Analyzing...{:else}Scan This Site{/if}
        </button>
        <p id="scan-status-message" class="scan-status-message">{scanStatusMessage}</p>
    </div>

    <div class="ai-model-meta">
        <span class="ai-model-chip">Gemini model: {context.activeModel}</span>
    </div>
</header>
