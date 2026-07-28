<script lang="ts">
    import type { RuleFamily } from "../../../js/background/modules/network_logger/network_log_analytics";
    import type { LoggerActiveFilterTag, LoggerFilterState, LoggerStatSummary } from "../types";

    export let stats: LoggerStatSummary;
    export let coverage: {
        topFamilies: Array<{ family: RuleFamily; label: string; count: number }>;
        topSources: Array<{ source: string; count: number }>;
    };
    export let filters: LoggerFilterState;
    export let activeFilterTags: LoggerActiveFilterTag[] = [];
    export let resetFilters: () => void;
</script>

<div class="stats-row">
    <div class="stat-chip live"><span class="chip-label">Session</span><strong>{stats.session}</strong></div>
    <div class="stat-chip blocked"><span class="chip-label">Blocked</span><strong>{stats.blocked}</strong></div>
    <div class="stat-chip modified"><span class="chip-label">Cleaned</span><strong>{stats.modified}</strong></div>
    <div class="stat-chip allowed"><span class="chip-label">Allowed</span><strong>{stats.allowed}</strong></div>
    <div class="stat-chip neutral"><span class="chip-label">Visible</span><strong>{stats.visible}</strong></div>
</div>

<div class="logger-intro">
    <div class="logger-intro-card">
        <span class="logger-intro-kicker">Diagnostics View</span>
        <p>{stats.sessionScope}</p>
        {#if stats.sessionStartedAtLabel || stats.lastUpdatedAtLabel}
            <div class="coverage-tags">
                {#if stats.sessionStartedAtLabel}
                    <span class="coverage-tag">Page load started <strong>{stats.sessionStartedAtLabel}</strong></span>
                {/if}
                {#if stats.lastUpdatedAtLabel}
                    <span class="coverage-tag">Last request <strong>{stats.lastUpdatedAtLabel}</strong></span>
                {/if}
            </div>
        {/if}
    </div>
</div>

<div class="coverage-row">
    <div class="coverage-panel">
        <span class="coverage-label">Blocker Mix</span>
        <div class="coverage-tags">
            {#if coverage.topFamilies.length > 0}
                {#each coverage.topFamilies as item}
                    <button
                        type="button"
                        class="coverage-tag coverage-tag-button"
                        class:active={filters.family === item.family}
                        on:click={() => (filters = { ...filters, family: filters.family === item.family ? "all" : item.family })}
                    >
                        {item.label} <strong>{item.count}</strong>
                    </button>
                {/each}
            {:else}
                <span class="coverage-empty">No blocked or cleaned requests yet.</span>
            {/if}
        </div>
    </div>

    <div class="coverage-panel">
        <span class="coverage-label">Top Sources</span>
        <div class="coverage-tags">
            {#if coverage.topSources.length > 0}
                {#each coverage.topSources as item}
                    <button
                        type="button"
                        class="coverage-tag coverage-tag-button source-tag"
                        class:active={filters.source === item.source}
                        title={item.source}
                        on:click={() => (filters = { ...filters, source: filters.source === item.source ? null : item.source })}
                    >
                        {item.source} <strong>{item.count}</strong>
                    </button>
                {/each}
            {:else}
                <span class="coverage-empty">No matched sources yet.</span>
            {/if}
        </div>
    </div>
</div>

<div class="family-filter-bar">
    <button class="family-filter-btn" class:active={filters.family === "all"} on:click={() => (filters = { ...filters, family: "all" })}>All families</button>
    <button class="family-filter-btn built-in" class:active={filters.family === "built-in"} on:click={() => (filters = { ...filters, family: "built-in" })}>Built-in</button>
    <button class="family-filter-btn user" class:active={filters.family === "user"} on:click={() => (filters = { ...filters, family: "user" })}>User</button>
    <button class="family-filter-btn ai" class:active={filters.family === "ai"} on:click={() => (filters = { ...filters, family: "ai" })}>AI</button>
    <button class="family-filter-btn privacy" class:active={filters.family === "privacy"} on:click={() => (filters = { ...filters, family: "privacy" })}>Privacy</button>
    <button class="family-filter-btn security" class:active={filters.family === "security"} on:click={() => (filters = { ...filters, family: "security" })}>Security</button>
    <button class="family-filter-btn media" class:active={filters.family === "media"} on:click={() => (filters = { ...filters, family: "media" })}>Media</button>
    <button class="family-filter-btn productivity" class:active={filters.family === "productivity"} on:click={() => (filters = { ...filters, family: "productivity" })}>Focus</button>
</div>

{#if activeFilterTags.length > 0}
    <div class="active-filters-bar">
        <span class="active-filters-label">Active filters</span>
        <div class="active-filter-tags">
            {#each activeFilterTags as tag}
                <span class="active-filter-tag">{tag.label}</span>
            {/each}
        </div>
        <button type="button" class="reset-filters-btn" on:click={resetFilters}>Reset filters</button>
    </div>
{/if}
