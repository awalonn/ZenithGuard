<script lang="ts">
    import type { LoggerEntry, LoggerVisibleEntry } from "../types";
    import { getLoggerDomainFilterCopyLabel, formatLoggerTimestamp } from "../logger_controller";

    export let visibleEntries: LoggerVisibleEntry[] = [];
    export let entries: LoggerEntry[] = [];
    export let inlineError = "";
    export let inlineStatus = "";
    export let canUndoLastBulkAdd = false;
    export let pendingAddDomain = "";
    export let pendingRemoveValue = "";
    export let copiedDomainFilterEntryId: number | null = null;
    export let handleManageInRules: (entry: LoggerVisibleEntry) => void | Promise<void>;
    export let handleAddCustomBlock: (entry: LoggerVisibleEntry) => void | Promise<void>;
    export let handleRemoveCustomBlock: (entry: LoggerVisibleEntry) => void | Promise<void>;
    export let handleCopyDomainFilter: (entry: LoggerVisibleEntry) => void | Promise<void>;
    export let handleUndoBulkAdd: () => void | Promise<void>;
</script>

<div class="table-container glass-panel">
    <table class="log-table">
        <thead>
            <tr>
                <th class="time">Time</th>
                <th class="status">Status</th>
                <th class="url">URL</th>
                <th class="source">Source</th>
                <th class="reason">Reason</th>
                <th class="type">Type</th>
                <th class="initiator">Initiator</th>
            </tr>
        </thead>
        <tbody>
            {#if visibleEntries.length > 0}
                {#each visibleEntries as entry (entry.id)}
                    <tr class={"log-row " + entry.status}>
                        <td class="time">{formatLoggerTimestamp(entry.timestamp)}</td>
                        <td class="status"><span class={"status-badge " + entry.status}>{entry.status}</span></td>
                        <td class="url" title={entry.url}>
                            {entry.url}
                            {#if entry.domain}
                                <span class="request-domain-chip" title={entry.domain}>{entry.domain}</span>
                            {/if}
                        </td>
                        <td class="source">
                            <div class="source-cell">
                                <span class={"source-badge " + entry.family}>{entry.matchedRuleInfo?.source || "-"}</span>
                                <span class="source-category">{entry.matchedRuleInfo?.category || "Uncategorized"}</span>
                                {#if entry.customMatchedValue}
                                    <span class="source-match" title={entry.customMatchedValue}>{entry.customMatchedValue}</span>
                                {/if}
                                {#if entry.customOriginLabel}
                                    <span class="origin-chip" title={entry.customOriginLabel}>{entry.customOriginLabel}</span>
                                {/if}
                                {#if entry.needsReview}
                                    <span class="review-chip">Needs review</span>
                                {/if}
                                {#if entry.reviewReason}
                                    <span class="review-reason-chip" title={entry.reviewReason}>{entry.reviewReason}</span>
                                {/if}
                                {#if entry.canAddCustomBlock && entry.customBlockCandidate}
                                    <span class="source-match" title={entry.customBlockCandidate}>Will save: {entry.customBlockCandidate}</span>
                                {/if}
                            </div>
                        </td>
                        <td class="reason">
                            <div class="reason-cell">
                                <span class="reason-text" title={entry.matchedRuleInfo?.detail}>{entry.matchedRuleInfo?.detail || "-"}</span>
                                <div class="row-actions">
                                    {#if entry.domain}
                                        <button type="button" class="row-action-btn row-action-btn-neutral" on:click={() => handleManageInRules(entry)}>Manage in My Rules</button>
                                    {/if}
                                    {#if entry.needsReview && (entry.customBlockCandidate || entry.domain)}
                                        <button type="button" class="row-action-btn row-action-btn-neutral" on:click={() => handleCopyDomainFilter(entry)}>
                                            {getLoggerDomainFilterCopyLabel(entry, copiedDomainFilterEntryId)}
                                        </button>
                                    {/if}
                                    {#if entry.customMatchedValue}
                                        <button
                                            type="button"
                                            class="row-action-btn"
                                            disabled={pendingRemoveValue === entry.customMatchedValue}
                                            on:click={() => handleRemoveCustomBlock(entry)}
                                        >
                                            {pendingRemoveValue === entry.customMatchedValue ? "Removing..." : "Remove custom block"}
                                        </button>
                                    {:else if entry.canAddCustomBlock}
                                        <button
                                            type="button"
                                            class="row-action-btn row-action-btn-primary"
                                            disabled={pendingAddDomain === (entry.customBlockCandidate || entry.domain)}
                                            on:click={() => handleAddCustomBlock(entry)}
                                        >
                                            {pendingAddDomain === (entry.customBlockCandidate || entry.domain) ? "Adding..." : "Add custom block"}
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        </td>
                        <td class="type">{entry.type || "-"}</td>
                        <td class="initiator" title={entry.initiator}>{entry.initiator || "-"}</td>
                    </tr>
                {/each}
            {:else}
                <tr>
                    <td colspan="7" class="empty-state">
                        <div class="empty-content">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7H13V13H11V7M11,15H13V17H11V15Z"></path>
                            </svg>
                            <p>{entries.length === 0 ? "No network activity captured for this tab yet." : "No requests match the current filters."}</p>
                            <span>{entries.length === 0 ? "Reload the page or browse a little to start populating the live logger." : "Try clearing the text filter or switching the status segment above."}</span>
                        </div>
                    </td>
                </tr>
            {/if}
        </tbody>
    </table>
</div>

{#if inlineError}
    <div class="logger-inline-error">{inlineError}</div>
{/if}

{#if inlineStatus}
    <div class="logger-inline-status">
        <span>{inlineStatus}</span>
        {#if canUndoLastBulkAdd}
            <button type="button" class="inline-status-action" on:click={handleUndoBulkAdd}>Undo last add</button>
        {/if}
    </div>
{/if}
