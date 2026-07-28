<script lang="ts">
    import { PAGE_ACTION_TOOLS } from "../tool_catalog";
    import { formatToolTimestamp, getToolActivityFollowUp } from "../tool_activity";
    import StatusCard from "./StatusCard.svelte";
    import type {
        PopupSnapshot,
        PopupToolDefinition,
        PopupReviewCandidateSummary,
        SitePolicyState,
        ToolActivityEntry,
        ToolStatusCard,
        WallFixDetailItem,
    } from "../types";

    export let snapshot: PopupSnapshot;
    export let policy: SitePolicyState;
    export let pageStatusCard: ToolStatusCard | null = null;
    export let toolActivity: ToolActivityEntry[] = [];
    export let wallFixCard: ToolStatusCard | null = null;
    export let cookieCard: ToolActivityEntry | null = null;
    export let suggestedMove: ToolStatusCard | null = null;
    export let wallFixDetails: WallFixDetailItem[] = [];
    export let busyTool: string | null = null;
    export let reviewCandidateCount = 0;
    export let reviewCandidateSummaries: PopupReviewCandidateSummary[] = [];

    export let onClearActivity: () => void | Promise<void> = () => {};
    export let onToolFollowUp: (entry: ToolActivityEntry) => void | Promise<void> = () => {};
    export let onStatusCardAction: (card: ToolStatusCard) => void | Promise<void> = () => {};
    export let onSuggestedAction: () => void | Promise<void> = () => {};
    export let onRunPageTool: (tool: PopupToolDefinition) => void | Promise<void> = () => {};
    export let onIsolationToggle: () => void | Promise<void> = () => {};
    export let onForgetfulToggle: () => void | Promise<void> = () => {};
    export let onSitePauseToggle: () => void | Promise<void> = () => {};
    export let onCopySiteReport: () => void | Promise<void> = () => {};
    export let onCopyReviewCandidates: () => void | Promise<void> = () => {};
    export let onOpenLogger: () => void | Promise<void> = () => {};
    export let onOpenLoggerReview: () => void | Promise<void> = () => {};
    export let onSaveWallFix: () => void | Promise<void> = () => {};
    export let onDiscardWallFix: () => void | Promise<void> = () => {};
    export let onOpenInspectorInstead: () => void | Promise<void> = () => {};
    export let onRemoveWallFix: () => void | Promise<void> = () => {};
    export let onRemoveHiddenRule: (index: number) => void | Promise<void> = () => {};

    let showWallTrace = false;
    $: reviewCandidateLabel = reviewCandidateCount === 1
        ? "1 review candidate captured"
        : `${reviewCandidateCount} review candidates captured`;
    $: reviewCandidateDescription = reviewCandidateCount > 0
        ? `${reviewCandidateLabel}. Open Logger Review to inspect allowed ad-tech or video-ad misses.`
        : "No review candidates captured yet. Reload the page or browse until the issue appears, then check again.";
</script>

<section class="tab-stack">
    {#if pageStatusCard}
        <StatusCard card={pageStatusCard} onAction={() => onStatusCardAction(pageStatusCard)} />
    {/if}

    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">Trace</div>
                <h3>Last Wall Assist Run</h3>
                <p>Last wall-assist result for this site. Expand only when you need the debug trace.</p>
            </div>
            <div class="trace-header-actions">
                {#if snapshot.wallAssistTrace}
                    <span class={"briefing-tag " + snapshot.wallAssistTrace.status}>
                        {snapshot.wallAssistTrace.status}
                    </span>
                    <button class="secondary-btn compact-btn" on:click={() => showWallTrace = !showWallTrace}>
                        {showWallTrace ? "Hide Trace" : "Show Trace"}
                    </button>
                {/if}
            </div>
        </div>

        {#if snapshot.wallAssistTrace}
            <div class="list-stack">
                <div class="log-item">
                    <div class="log-topline">
                        <strong>{snapshot.wallAssistTrace.summary}</strong>
                        <span class="policy-kicker">{formatToolTimestamp(snapshot.wallAssistTrace.updatedAt)}</span>
                    </div>
                    {#if snapshot.wallAssistTrace.lastError}
                        <div class="log-reason"><code>{snapshot.wallAssistTrace.lastError}</code></div>
                    {/if}
                </div>

                {#if showWallTrace}
                    {#if snapshot.wallAssistTrace.overlaySelector}
                        <div class="log-item">
                            <div class="log-topline">
                                <strong>Overlay Selector</strong>
                            </div>
                            <div class="log-reason"><code>{snapshot.wallAssistTrace.overlaySelector}</code></div>
                        </div>
                    {/if}

                    {#if snapshot.wallAssistTrace.contentUnlockSelector}
                        <div class="log-item">
                            <div class="log-topline">
                                <strong>Content Unlock Selector</strong>
                            </div>
                            <div class="log-reason"><code>{snapshot.wallAssistTrace.contentUnlockSelector}</code></div>
                        </div>
                    {/if}

                    {#each snapshot.wallAssistTrace.stages as stage}
                        <div class="log-item">
                            <div class="log-topline">
                                <strong>{stage.label}</strong>
                                <span class={"tone-pill " + stage.tone}>{stage.tone}</span>
                                <span class="policy-kicker">{formatToolTimestamp(stage.timestamp)}</span>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        {:else}
            <div class="empty-state">
                <strong>No wall-assist trace for this site yet.</strong>
                <span>When you run the wall assistant, ZenithGuard will show each stage here so failures do not disappear silently.</span>
            </div>
        {/if}
    </article>

    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">History</div>
                <h3>Recent Tool Activity</h3>
                <p>Recent page-tool and automatic cleanup outcomes for this site.</p>
            </div>
            <button class="secondary-btn" on:click={onClearActivity} disabled={toolActivity.length === 0}>Clear</button>
        </div>

        {#if toolActivity.length > 0}
            <div class="list-stack">
                {#each toolActivity as entry}
                    <div class="log-item">
                        <div class="log-topline">
                            <strong>{entry.title}</strong>
                            <span class="briefing-tag subtle">{entry.tool}</span>
                            <span class="policy-kicker">{formatToolTimestamp(entry.timestamp)}</span>
                        </div>
                        <div class="log-reason">{entry.message}</div>
                        {#if getToolActivityFollowUp(entry)}
                            <div class="tool-activity-actions">
                                <button class="secondary-btn compact-btn" on:click={() => onToolFollowUp(entry)}>
                                    {getToolActivityFollowUp(entry)?.label}
                                </button>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else}
            <div class="empty-state">
                <strong>No recent tool activity for this site yet.</strong>
                <span>Run Inspector, Zapper, Fix Cookies, or let automatic cosmetic cleanup remove leftover ad shells. The latest outcomes will appear here.</span>
            </div>
        {/if}
    </article>

    {#if wallFixCard}
        <StatusCard card={wallFixCard} onAction={() => onStatusCardAction(wallFixCard)} />
    {/if}

    {#if policy.hasTemporaryWallFix || policy.hasSavedWallFix}
        <article class="glass-card">
            <div class="card-header simple">
                <div>
                    <div class="mini-section-label">Wall Recovery</div>
                    <h3>Wall Fix Controls</h3>
                    <p>Save, discard, or remove the current wall fix without digging through other site actions.</p>
                </div>
            </div>
            <div class="action-list">
                {#if policy.hasTemporaryWallFix && !policy.hasPartialTemporaryWallFix}
                    <button class="action-item" on:click={onSaveWallFix}>
                        <div class="action-copy">
                            <strong>Save Wall Fix</strong>
                            <span>Keep this temporary wall-fix for future visits only if the page now looks correct.</span>
                        </div>
                        <span class="action-meta">Save</span>
                    </button>
                {/if}
                {#if policy.hasTemporaryWallFix}
                    <button class="action-item" on:click={onDiscardWallFix}>
                        <div class="action-copy">
                            <strong>Discard Wall Fix</strong>
                            <span>Throw away the temporary wall-fix and reload the site cleanly.</span>
                        </div>
                        <span class="action-meta">Drop</span>
                    </button>
                {/if}
                {#if policy.hasSavedWallFix}
                    <button class="action-item" on:click={onRemoveWallFix}>
                        <div class="action-copy">
                            <strong>Remove Wall Fix</strong>
                            <span>Delete the saved wall override for this site if it breaks the page.</span>
                        </div>
                        <span class="action-meta">Remove</span>
                    </button>
                {/if}
                {#if policy.hasPartialTemporaryWallFix}
                    <button class="action-item" on:click={onOpenInspectorInstead}>
                        <div class="action-copy">
                            <strong>Open Inspector Instead</strong>
                            <span>This wall fix is only partial. Use Inspector to remove the remaining blocker or locked container manually.</span>
                        </div>
                        <span class="action-meta">Inspect</span>
                    </button>
                {/if}
            </div>
        </article>
    {/if}

    {#if cookieCard}
        <article class={"glass-card tool-feedback-card " + cookieCard.tone}>
            <h3>{cookieCard.title}</h3>
            <p>{cookieCard.message}</p>
            {#if getToolActivityFollowUp(cookieCard)}
                <button class="secondary-btn" on:click={() => onToolFollowUp(cookieCard)}>
                    {getToolActivityFollowUp(cookieCard)?.label}
                </button>
            {/if}
        </article>
    {/if}

    {#if suggestedMove}
        <StatusCard card={suggestedMove} onAction={onSuggestedAction} />
    {/if}

    <article class="glass-card">
        <div class="card-header simple">
            <div>
                <div class="mini-section-label">Manual Report</div>
                <h3>Report This Site</h3>
                <p>{reviewCandidateDescription}</p>
            </div>
        </div>
        {#if reviewCandidateSummaries.length > 0}
            <div class="list-stack">
                {#each reviewCandidateSummaries as candidate}
                    <div class="log-item">
                        <div class="log-topline">
                            <strong>{candidate.domain}</strong>
                            <span class="briefing-tag subtle">{candidate.type}</span>
                        </div>
                        <div class="log-reason">{candidate.reason}</div>
                    </div>
                {/each}
            </div>
        {/if}
        <div class="action-list">
            <button class="action-item" on:click={onCopySiteReport}>
                <div class="action-copy">
                    <strong>Copy Site Report</strong>
                    <span>Use this when a page still has an ad, popup, leftover box, freeze, or broken feature.</span>
                </div>
                <span class="action-meta">Copy</span>
            </button>
            <button class="action-item" on:click={onOpenLoggerReview}>
                <div class="action-copy">
                    <strong>Open Logger Review</strong>
                    <span>Jump straight to allowed third-party requests that look like ad-tech or video-ad misses.</span>
                </div>
                <span class="action-meta">Review</span>
            </button>
            <button class="action-item" on:click={onCopyReviewCandidates} disabled={reviewCandidateCount === 0}>
                <div class="action-copy">
                    <strong>Copy Review List</strong>
                    <span>Copy only the redacted review-candidate domains, types, and reasons.</span>
                </div>
                <span class="action-meta">Copy</span>
            </button>
        </div>
    </article>

    <article class="glass-card">
        <div class="card-header simple">
            <div>
                <div class="mini-section-label">Page Cleanup</div>
                <h3>Page Actions</h3>
                <p>Start with Inspector or Zapper. Treat the AI wall assistant as a last-resort experiment, not a dependable fix.</p>
            </div>
        </div>
        <div class="action-list">
            {#each PAGE_ACTION_TOOLS as tool}
                <button class="action-item" disabled={busyTool === tool.actionType} on:click={() => onRunPageTool(tool)}>
                    <div class="action-copy">
                        <strong>{busyTool === tool.actionType ? "Working..." : tool.label}</strong>
                        <span>{tool.description}</span>
                    </div>
                    <span class="action-meta">{busyTool === tool.actionType ? "Running" : "Run"}</span>
                </button>
            {/each}
        </div>
    </article>

    <article class="glass-card">
        <div class="card-header simple">
            <div>
                <div class="mini-section-label">Site Controls</div>
                <h3>Site Actions</h3>
                <p>Adjust protection mode and follow-up actions for this domain.</p>
            </div>
        </div>
        <div class="action-list">
            <button class="action-item" on:click={onIsolationToggle}>
                <div class="action-copy">
                    <strong>{policy.isIsolationModeEnabled ? "Isolation On" : "Toggle Isolation"}</strong>
                    <span>Strengthen site privacy by blocking third-party frames and scripts.</span>
                </div>
                <span class="action-meta">{policy.isIsolationModeEnabled ? "On" : "Off"}</span>
            </button>
            <button class="action-item" on:click={onForgetfulToggle}>
                <div class="action-copy">
                    <strong>{policy.isForgetfulBrowsingEnabled ? "Forgetful On" : "Toggle Forgetful"}</strong>
                    <span>Clear cookies and local site data automatically after closing this site.</span>
                </div>
                <span class="action-meta">{policy.isForgetfulBrowsingEnabled ? "On" : "Off"}</span>
            </button>
            <button class="action-item" on:click={onSitePauseToggle}>
                <div class="action-copy">
                    <strong>{policy.isSiteProtectionEnabled ? "Pause Site" : "Resume Site"}</strong>
                    <span>Temporarily stand down or restore protection for this domain.</span>
                </div>
                <span class="action-meta">{policy.isSiteProtectionEnabled ? "Live" : "Paused"}</span>
            </button>
            <button class="action-item" on:click={onOpenLogger}>
                <div class="action-copy">
                    <strong>Open Logger</strong>
                    <span>Inspect live request decisions and exact matched rules.</span>
                </div>
                <span class="action-meta">View</span>
            </button>
        </div>
    </article>

    {#if snapshot.hiddenRules.length > 0}
        <article class="glass-card">
            <div class="card-header simple">
                <div>
                    <div class="mini-section-label">Saved Cleanup</div>
                    <h3>Hidden Elements</h3>
                </div>
            </div>
            <div class="list-stack">
                {#each snapshot.hiddenRules as rule, index}
                    {#if rule.enabled !== false}
                        <div class="log-item removable-item">
                            <code>{rule.value}</code>
                            <button class="secondary-btn compact-btn danger-btn" on:click={() => onRemoveHiddenRule(index)}>
                                Remove
                            </button>
                        </div>
                    {/if}
                {/each}
            </div>
        </article>
    {/if}

    {#if wallFixDetails.length > 0}
        <article class="glass-card">
            <div class="card-header simple">
                <div>
                    <div class="mini-section-label">Wall Recovery</div>
                    <h3>Wall Fix Details</h3>
                </div>
            </div>
            <div class="list-stack">
                {#each wallFixDetails as detail}
                    <div class="log-item">
                        <div class="log-topline">
                            <strong>{detail.label}</strong>
                        </div>
                        <div class="log-reason"><code>{detail.value}</code></div>
                    </div>
                {/each}
            </div>
        </article>
    {/if}
</section>
