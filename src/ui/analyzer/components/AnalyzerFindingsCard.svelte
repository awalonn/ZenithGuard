<script lang="ts">
    import type { AnalyzerFinding } from "../types";

    export let title = "";
    export let tone = "";
    export let count = 0;
    export let findings: AnalyzerFinding[] = [];
    export let hiddenCoveredCount = 0;
    export let needsActionOnly = false;
    export let emptyMessage = "";
    export let tabId: number | null = null;
    export let variant: "network" | "heuristic" = "network";
    export let getObservedLabel: (finding: AnalyzerFinding) => string;
    export let onOpenInLogger: (finding: AnalyzerFinding) => void;
    export let onManageInRules: (finding: AnalyzerFinding) => void;
    export let onAddFinding: (finding: AnalyzerFinding) => void | Promise<void>;
    export let onRemoveFinding: (finding: AnalyzerFinding) => void | Promise<void>;

    const lineClass = variant === "heuristic" ? "suggestion-description" : "threat-url";
    const entryClass = variant === "heuristic" ? "suggestion-card suggestion-card-actionable" : "threat-entry actionable-threat-entry";
</script>

<div class="report-card">
    <div class={"card-title " + tone}>
        <div class="card-title-main">
            <span>{title}</span>
            <span class="category-count">{count}</span>
        </div>
        {#if needsActionOnly && hiddenCoveredCount > 0}
            <span class="category-filter-chip">{hiddenCoveredCount} covered hidden</span>
        {/if}
    </div>
    {#if findings.length > 0}
        <div class="report-list" id={variant === "heuristic" ? "heuristic-keywords-content" : undefined}>
            {#each findings as finding}
                <div class={entryClass}>
                    <div class="threat-entry-main">
                        {#if finding.coverageTone === "custom"}
                            <span class="finding-status-chip is-blocked is-custom">{finding.coverageLabel || "Custom blocklist"}</span>
                        {:else if finding.isBlocked}
                            <span class={"finding-status-chip is-blocked " + (finding.coverageTone ? `is-${finding.coverageTone}` : "")}>{finding.coverageLabel || "Already blocked"}</span>
                        {:else if finding.domain}
                            <span class={"finding-status-chip " + (finding.observedStatus === "blocked" ? "is-observed-blocked" : finding.observedStatus === "seen" ? "is-observed-seen" : "is-unknown")}>{getObservedLabel(finding) || "Uncovered"}</span>
                        {:else}
                            <span class="finding-status-chip is-unknown">No domain</span>
                        {/if}

                        <div class="threat-url">{finding.description}</div>
                        {#if finding.domain}<span class="threat-domain-chip">{finding.domain}</span>{/if}
                        {#if finding.coverageTone !== "custom" && finding.coverageLabel}<span class="matched-rule-chip">{finding.coverageLabel}</span>{/if}
                        {#if finding.coverageTone === "custom" && finding.matchedRuleValue}<span class="matched-rule-chip">{finding.matchedRuleValue}</span>{/if}
                        {#if !finding.isBlocked && finding.blocklistCandidate}<span class="matched-rule-chip">Will save: {finding.blocklistCandidate}</span>{/if}
                        {#if getObservedLabel(finding) && finding.coverageTone !== "custom" && !finding.isBlocked}<span class="category-filter-chip">{getObservedLabel(finding)}</span>{/if}
                        {#if finding.evidenceCount > 1}<span class="evidence-count-chip">{finding.evidenceCount} signals</span>{/if}
                        <div class="evidence-list">
                            {#each finding.evidenceLines as line}
                                <span class={lineClass}>{line}</span>
                            {/each}
                        </div>
                        {#if finding.addInfo}<p class="finding-info-message">{finding.addInfo}</p>{/if}
                        {#if finding.addError}<p class="finding-error-message">{finding.addError}</p>{/if}
                    </div>
                    <div class="threat-entry-actions">
                        {#if finding.domain && tabId}<button type="button" class="finding-action-btn finding-action-btn-tertiary" on:click={() => onOpenInLogger(finding)}>Open in Logger</button>{/if}
                        {#if finding.domain}<button type="button" class="finding-action-btn finding-action-btn-tertiary" on:click={() => onManageInRules(finding)}>Manage in My Rules</button>{/if}
                        {#if finding.coverageTone === "custom"}
                            <button type="button" class="finding-action-btn finding-action-btn-secondary" disabled={finding.isRemoving} on:click={() => onRemoveFinding(finding)}>{finding.isRemoving ? "Removing..." : "Remove Custom Block"}</button>
                        {:else if !finding.isBlocked && finding.domain}
                            <button type="button" class="finding-action-btn" disabled={finding.isAdding} on:click={() => onAddFinding(finding)}>{finding.isAdding ? "Adding..." : "Add to Blocklist"}</button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <p class="no-results-message">{emptyMessage}</p>
    {/if}
</div>
