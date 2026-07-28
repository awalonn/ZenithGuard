<script lang="ts">
    import { onMount } from "svelte";
    import { loadAnalyzerContext } from "./loaders";
    import { attachAnalyzerLiveSync } from "./live_sync";
    import { getAnalyzerContextKey, getAnalyzerSupportDataChangeTransition, hasAnalyzerPageChanged, shouldApplyAnalyzerOutcome } from "./live_state";
    import {
        addFindingToBlocklist,
        manageFindingInRules,
        openAnalyzerSettings,
        openFindingInLogger,
        removeFindingFromCustomBlocklist,
        runAnalyzerScan,
    } from "./analyzer_controller";
    import type { AnalyzerFinding, AnalyzerReport, AnalyzerScanContext, AnalyzerViewState } from "./types";
    import AnalyzerHeader from "./components/AnalyzerHeader.svelte";
    import AnalyzerStatePanel from "./components/AnalyzerStatePanel.svelte";
    import AnalyzerExecutiveSummary from "./components/AnalyzerExecutiveSummary.svelte";
    import AnalyzerFindingsCard from "./components/AnalyzerFindingsCard.svelte";
    import AnalyzerTextListCard from "./components/AnalyzerTextListCard.svelte";
    import AnalyzerIdleState from "./components/AnalyzerIdleState.svelte";

    let context: AnalyzerScanContext = {
        tabId: null,
        pageTitle: "AI Page Analyzer",
        pageUrl: null,
        hostname: "Ready to scan a browser tab",
        activeModel: "Loading...",
        apiKeyPresent: false,
    };

    let state: AnalyzerViewState = "idle";
    let report: AnalyzerReport | null = null;
    let errorMessage = "";
    let scanStatusMessage = "";
    let needsActionOnly = false;
    let currentContextKey = getAnalyzerContextKey(context);
    let activeScanRequestId = 0;
    const pinnedQueryTabId = getQueryTabId();

    function getQueryTabId(): number | null {
        const value = new URLSearchParams(window.location.search).get("tabId");
        if (!value) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    async function refreshContext(): Promise<void> {
        const nextContext = await loadAnalyzerContext(getQueryTabId());
        if (hasAnalyzerPageChanged(context, nextContext)) {
            currentContextKey = getAnalyzerContextKey(nextContext);
        }
        context = nextContext;
    }

    function resetForLivePageChange(): void {
        activeScanRequestId += 1;
        report = null;
        errorMessage = "";
        needsActionOnly = false;

        if (state !== "idle") {
            state = "idle";
            scanStatusMessage = "Page changed. Run a new scan for the current page.";
        }
    }

    function resetForSupportDataChange(): void {
        const transition = getAnalyzerSupportDataChangeTransition(state);
        if (transition.invalidateActiveScan) {
            activeScanRequestId += 1;
        }
        if (transition.clearReport) {
            report = null;
        }
        if (transition.clearNeedsActionOnly) {
            needsActionOnly = false;
        }
        errorMessage = "";
        state = transition.nextState;
        if (transition.scanStatusMessage) {
            scanStatusMessage = transition.scanStatusMessage;
        }
    }

    async function initialize(): Promise<void> {
        await refreshContext();
    }

    onMount(() => {
        let detach = () => {};

        void initialize().then(() => {
            detach = attachAnalyzerLiveSync({
                followActiveTab: pinnedQueryTabId === null,
                getCurrentTabId: () => context.tabId,
                onPageChanged: resetForLivePageChange,
                onSupportDataChanged: resetForSupportDataChange,
                refreshContext,
            });
        });

        return () => {
            detach();
        };
    });

    async function startScan(): Promise<void> {
        const requestId = activeScanRequestId + 1;
        activeScanRequestId = requestId;
        const startedContextKey = currentContextKey;
        const scanContext = { ...context };

        state = "loading";
        scanStatusMessage = "Checking AI configuration...";
        errorMessage = "";

        const outcome = await runAnalyzerScan(scanContext);
        if (!shouldApplyAnalyzerOutcome(requestId, activeScanRequestId, startedContextKey, currentContextKey)) {
            scanStatusMessage = "Page changed during the scan. Run it again for the current page.";
            state = "idle";
            report = null;
            errorMessage = "";
            needsActionOnly = false;
            return;
        }

        context = outcome.context;
        currentContextKey = getAnalyzerContextKey(outcome.context);
        state = outcome.state;
        report = outcome.report || null;
        errorMessage = outcome.errorMessage || "";
        scanStatusMessage = outcome.scanStatusMessage;
        needsActionOnly = Boolean(outcome.report?.needsAction.needsAction && outcome.report.needsAction.needsAction > 0);
    }

    function getVisibleFindings(findings: AnalyzerFinding[]): AnalyzerFinding[] {
        return needsActionOnly ? findings.filter((finding) => !finding.isBlocked) : findings;
    }

    function getHiddenCoveredCount(findings: AnalyzerFinding[]): number {
        return Math.max(0, findings.length - getVisibleFindings(findings).length);
    }

    function getObservedLabel(finding: AnalyzerFinding): string {
        return finding.observedStatus === "blocked"
            ? "Blocked traffic"
            : finding.observedStatus === "seen"
                ? "Seen traffic"
                : "";
    }

    function getEmptyMessage(kind: "network" | "heuristic"): string {
        if (needsActionOnly) {
            return kind === "network"
                ? "All network domains in this scan are already covered."
                : "All heuristic domains in this scan are already covered.";
        }

        return kind === "network"
            ? "Clean as a whistle. No intrusive trackers found."
            : "Page scripts appear legitimate and safe.";
    }

    async function handleAddFinding(finding: AnalyzerFinding): Promise<void> {
        finding.isAdding = true;
        finding.addError = "";
        finding.addInfo = "";
        const result = await addFindingToBlocklist(finding);
        finding.isAdding = false;

        if (!result.success) {
            finding.addError = result.message || "Could not add this domain.";
            report = report ? { ...report } : report;
            return;
        }

        finding.isBlocked = true;
        finding.coverageLabel = result.status === "existing" ? "Custom blocklist" : "Added from Analyzer";
        finding.coverageTone = "custom";
        finding.matchedRuleValue = finding.blocklistCandidate || finding.domain;
        finding.addError = "";
        finding.addInfo = result.status === "existing" ? "This domain was already in My Rules." : "";
        report = report ? { ...report } : report;
    }

    async function handleRemoveFinding(finding: AnalyzerFinding): Promise<void> {
        finding.isRemoving = true;
        finding.addError = "";
        finding.addInfo = "";
        try {
            await removeFindingFromCustomBlocklist(finding);
            finding.isRemoving = false;
            finding.isBlocked = false;
            finding.coverageLabel = undefined;
            finding.coverageTone = undefined;
            finding.matchedRuleValue = undefined;
            finding.addInfo = "";
            report = report ? { ...report } : report;
        } catch (error) {
            finding.isRemoving = false;
            finding.addError = error instanceof Error ? error.message : String(error);
            report = report ? { ...report } : report;
        }
    }
</script>

<div class="container analyzer-shell zg-analyzer-shell">
    <AnalyzerHeader
        {context}
        {state}
        totalFindings={report ? report.counts.networkThreats + report.counts.visualAnnoyances + report.counts.heuristicIssues + report.counts.darkPatterns : 0}
        riskLabel={report?.gradeLabel || "Waiting for scan"}
        {scanStatusMessage}
        {startScan}
    />

    {#if state === "loading"}
        <AnalyzerStatePanel
            kind="loading"
            title="ZenithGuard AI is evaluating the current page."
            message="This can take a moment while the background scan collects network and UI evidence."
        />
    {:else if state === "error"}
        <AnalyzerStatePanel kind="error" title="Analysis Failed" message={errorMessage} primaryActionLabel="Try Again" onPrimaryAction={startScan} />
    {:else if state === "quota-error"}
        <AnalyzerStatePanel
            kind="quota"
            title="AI Quota Reached"
            message="You have hit the current Gemini usage limit for this key. ZenithGuard will work again as soon as quota resets or you switch to another key."
            primaryActionLabel="Open AI Settings"
            onPrimaryAction={openAnalyzerSettings}
        />
    {:else if state === "timeout-error"}
        <AnalyzerStatePanel
            kind="timeout"
            title="AI Timed Out"
            message={errorMessage}
            primaryActionLabel="Try Again"
            secondaryActionLabel="Open AI Settings"
            onPrimaryAction={startScan}
            onSecondaryAction={openAnalyzerSettings}
        />
    {:else if state === "api-key-missing"}
        <AnalyzerStatePanel
            kind="api-key"
            title="API Key Required"
            message="The AI Page Analyzer needs a Google Gemini API key before it can scan the active tab."
            primaryActionLabel="Open Settings"
            onPrimaryAction={openAnalyzerSettings}
        />
    {:else if state === "report" && report}
        <div class="report-view">
            <AnalyzerExecutiveSummary {report} />

            <div class="report-filter-bar">
                <label class="report-filter-toggle">
                    <input type="checkbox" bind:checked={needsActionOnly} />
                    <span>Needs action only</span>
                </label>
                {#if needsActionOnly}
                    <span class="report-filter-note">Showing only uncovered network and heuristic domains.</span>
                    <button type="button" class="report-filter-reset" on:click={() => (needsActionOnly = false)}>Show everything</button>
                {/if}
            </div>

            <div class="report-grid">
                <AnalyzerFindingsCard
                    title="Network Threats"
                    tone="tone-danger"
                    count={report.counts.networkThreats}
                    findings={getVisibleFindings(report.findings.network)}
                    hiddenCoveredCount={getHiddenCoveredCount(report.findings.network)}
                    {needsActionOnly}
                    emptyMessage={getEmptyMessage("network")}
                    tabId={context.tabId}
                    variant="network"
                    {getObservedLabel}
                    onOpenInLogger={(finding) => openFindingInLogger(context.tabId!, finding)}
                    onManageInRules={manageFindingInRules}
                    onAddFinding={handleAddFinding}
                    onRemoveFinding={handleRemoveFinding}
                />

                <AnalyzerTextListCard
                    title="Visual Analysis"
                    tone="tone-warning"
                    count={report.counts.visualAnnoyances}
                    items={report.findings.visual}
                    emptyMessage="No visual distractions or large ad units detected."
                    variant="visual"
                />

                <AnalyzerFindingsCard
                    title="Code Heuristics"
                    tone="tone-info"
                    count={report.counts.heuristicIssues}
                    findings={getVisibleFindings(report.findings.heuristic)}
                    hiddenCoveredCount={getHiddenCoveredCount(report.findings.heuristic)}
                    {needsActionOnly}
                    emptyMessage={getEmptyMessage("heuristic")}
                    tabId={context.tabId}
                    variant="heuristic"
                    {getObservedLabel}
                    onOpenInLogger={(finding) => openFindingInLogger(context.tabId!, finding)}
                    onManageInRules={manageFindingInRules}
                    onAddFinding={handleAddFinding}
                    onRemoveFinding={handleRemoveFinding}
                />

                <AnalyzerTextListCard
                    title="User Integrity (Dark Patterns)"
                    tone="tone-accent"
                    count={report.counts.darkPatterns}
                    items={report.findings.darkPattern}
                    emptyMessage="No manipulative UX or dark patterns identified."
                    variant="accent"
                />
            </div>
        </div>
    {:else}
        <AnalyzerIdleState />
    {/if}
</div>
