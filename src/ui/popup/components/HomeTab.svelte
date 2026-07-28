<script lang="ts">
    import { getAiScanLabel, getSitePolicySummary, getWallFixLabel } from "../state";
    import type { CosmeticCleanupSummary, PopupSnapshot, SitePolicyState, ToolActivityEntry } from "../types";

    export let policy: SitePolicyState;
    export let snapshot: PopupSnapshot;
    export let blockedCount = 0;
    export let cleanedCount = 0;
    export let recentCosmeticCleanup: ToolActivityEntry | null = null;
    export let cosmeticCleanupSummary: CosmeticCleanupSummary | null = null;
    export let onStopFocusMode: () => void | Promise<void> = () => {};
    export let onOpenAnalyzer: () => void | Promise<void> = () => {};
</script>

<section class="tab-stack">
    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">Live Overview</div>
                <h3>Site Policy</h3>
                <p>{getSitePolicySummary(policy)}</p>
            </div>
            {#if policy.focusModeActive}
                <button class="secondary-btn" on:click={onStopFocusMode}>Stop Focus Mode</button>
            {/if}
        </div>

        <div class="stats-grid compact-stats">
            <div class="stat-card compact">
                <span class="stat-label">Blocked</span>
                <strong>{blockedCount}</strong>
            </div>
            <div class="stat-card compact">
                <span class="stat-label">Cleaned</span>
                <strong>{cleanedCount}</strong>
            </div>
            <div class="stat-card compact">
                <span class="stat-label">Trackers Seen</span>
                <strong>{snapshot.privacyStats.trackersDetected || 0}</strong>
            </div>
            <div class="stat-card compact">
                <span class="stat-label">Modes</span>
                <strong>{policy.activeSiteModes}</strong>
            </div>
        </div>

        <div class="policy-list">
            <div class="policy-line" class:active={policy.isProtectionEnabled && policy.isSiteProtectionEnabled}>
                <div class="policy-line-main">
                    <span class="policy-kicker">Baseline</span>
                    <strong>Core Protection</strong>
                    <p>{policy.isSiteProtectionEnabled ? "Blocking is active on this site." : "This site is currently paused."}</p>
                </div>
                <span class="state-pill" class:active={policy.isProtectionEnabled && policy.isSiteProtectionEnabled}>
                    {policy.isProtectionEnabled && policy.isSiteProtectionEnabled ? "Active" : "Bypassed"}
                </span>
            </div>

            <div class="policy-line" class:active={policy.isIsolationModeEnabled}>
                <div class="policy-line-main">
                    <strong>Isolation Mode</strong>
                    <p>Blocks third-party scripts and frames for this site.</p>
                </div>
                <span class="state-pill" class:active={policy.isIsolationModeEnabled}>
                    {policy.isIsolationModeEnabled ? "On" : "Off"}
                </span>
            </div>

            <div class="policy-line" class:active={policy.isForgetfulBrowsingEnabled}>
                <div class="policy-line-main">
                    <strong>Forgetful Browsing</strong>
                    <p>Clears site data after you close tabs from this domain.</p>
                </div>
                <span class="state-pill" class:active={policy.isForgetfulBrowsingEnabled}>
                    {policy.isForgetfulBrowsingEnabled ? "On" : "Off"}
                </span>
            </div>

            <div class="policy-line" class:active={policy.hasCustomHidingRules}>
                <div class="policy-line-main">
                    <strong>Custom Hiding</strong>
                    <p>{policy.hasCustomHidingRules ? "Saved element cleanup rules already exist here." : "No saved element-hiding rules yet."}</p>
                </div>
                <span class="state-pill" class:active={policy.hasCustomHidingRules}>
                    {policy.hasCustomHidingRules ? "Present" : "None"}
                </span>
            </div>

            <div class="policy-line" class:active={policy.hasSavedWallFix || policy.hasTemporaryWallFix}>
                <div class="policy-line-main">
                    <strong>Wall Fix</strong>
                    <p>{getWallFixLabel(policy)}</p>
                </div>
                <span class="state-pill" class:active={policy.hasSavedWallFix || policy.hasTemporaryWallFix}>
                    {#if policy.hasTemporaryWallFix}
                        {policy.hasPartialTemporaryWallFix ? "Partial" : "Temporary"}
                    {:else if policy.hasSavedWallFix}
                        Saved
                    {:else}
                        None
                    {/if}
                </span>
            </div>

            {#if recentCosmeticCleanup}
                <div class="policy-line active">
                    <div class="policy-line-main">
                        <strong>Auto Cleanup</strong>
                        <p>
                            {recentCosmeticCleanup.message}
                            {#if cosmeticCleanupSummary?.latestHint}
                                Last matched: {cosmeticCleanupSummary.latestHint}
                            {/if}
                        </p>
                    </div>
                    <span class="state-pill active">Cleaned</span>
                </div>
            {/if}
        </div>
    </article>

    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">AI Assist</div>
                <h3>AI Analysis</h3>
                <p>{getAiScanLabel(snapshot)}</p>
            </div>
            <button class="secondary-btn" on:click={onOpenAnalyzer}>Open Analyzer</button>
        </div>

        <div class="analysis-callout">
            <span class="briefing-tag subtle">AI scan</span>
            <strong>Review suspicious domains, tracker patterns, and next actions for this page.</strong>
        </div>
    </article>
</section>
