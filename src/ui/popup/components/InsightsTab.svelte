<script lang="ts">
    import {
        getHostnameFromLogUrl,
        getLogSourceLabel,
        getLogStatusLabel,
        getMatchedValue,
        getProtectionSnapshotSummary,
    } from "../state";
    import type { PopupNetworkLog, PopupSnapshot } from "../types";

    export let snapshot: PopupSnapshot;
    export let blockedCount = 0;
    export let cleanedCount = 0;
    export let trackerCount = 0;
    export let blockerMix: string[] = [];
    export let topSources: string[] = [];
    export let notableEntries: PopupNetworkLog[] = [];
    export let onOpenAnalyzer: () => void | Promise<void> = () => {};
    export let onOpenLogger: () => void | Promise<void> = () => {};
</script>

<section class="tab-stack">
    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">Network View</div>
                <h3>Protection Snapshot</h3>
                <p>{getProtectionSnapshotSummary(snapshot)}</p>
            </div>
            <button class="secondary-btn" on:click={onOpenAnalyzer}>Open Analyzer</button>
        </div>

        <div class="stats-grid compact-stats">
            <div class="stat-card compact"><span class="stat-label">Blocked</span><strong>{blockedCount}</strong></div>
            <div class="stat-card compact"><span class="stat-label">Cleaned</span><strong>{cleanedCount}</strong></div>
            <div class="stat-card compact"><span class="stat-label">Trackers Seen</span><strong>{trackerCount}</strong></div>
        </div>

        <div class="tag-group">
            {#if blockerMix.length > 0}
                {#each blockerMix as item}
                    <span class="briefing-tag">{item}</span>
                {/each}
            {:else}
                <span class="briefing-tag subtle">No blocked or cleaned requests yet</span>
            {/if}
        </div>

        <div class="tag-group">
            {#if topSources.length > 0}
                {#each topSources as item}
                    <span class="briefing-tag subtle">{item}</span>
                {/each}
            {:else}
                <span class="briefing-tag subtle">No matched sources yet</span>
            {/if}
        </div>
    </article>

    <article class="glass-card">
        <div class="card-header">
            <div>
                <div class="mini-section-label">Recent Signals</div>
                <h3>Recent Notable Activity</h3>
                <p>Latest blocked or cleaned requests on this page.</p>
            </div>
            <button class="secondary-btn" on:click={onOpenLogger}>Open Logger</button>
        </div>

        {#if notableEntries.length > 0}
            <div class="list-stack">
                {#each notableEntries as entry}
                    <div class="log-item">
                        <div class="log-topline">
                            <strong>{getHostnameFromLogUrl(entry.url)}</strong>
                            <span class="briefing-tag subtle">{getLogStatusLabel(entry)}</span>
                            <span class="policy-kicker">{getLogSourceLabel(entry)}</span>
                        </div>
                        <div class="log-reason">{getMatchedValue(entry) || entry.url}</div>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="empty-state">
                <strong>No blocked or cleaned requests yet.</strong>
                <span>Browse a little more or reload the page to populate notable activity.</span>
            </div>
        {/if}
    </article>
</section>
