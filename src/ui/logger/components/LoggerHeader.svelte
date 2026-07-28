<script lang="ts">
    import { getLoggerBulkAddFiltersLabel, getLoggerDomainFilterListCopyLabel } from "../logger_controller";
    import type { LoggerContext, LoggerFilterState } from "../types";

    export let context: LoggerContext;
    export let filters: LoggerFilterState;
    export let reviewableCount = 0;
    export let reviewCopyState: "" | "copied" = "";
    export let domainFiltersCopyState: "" | "copied" = "";
    export let addFiltersState: "" | "confirming" | "adding" | "added" = "";
    export let visibleDomainFilterCount = 0;
    export let addFiltersLabelCount = 0;
    export let handleClearLog: () => Promise<void>;
    export let handleCopyReviewList: () => Promise<void>;
    export let handleCopyDomainFilterList: () => Promise<void>;
    export let handleAddVisibleFilters: () => Promise<void>;
    export let handleOpenAnalyzer: () => Promise<void>;

    function setStatusFilter(status: LoggerFilterState["status"]): void {
        filters = { ...filters, status, review: "all" };
    }

    function toggleReviewFilter(): void {
        filters = filters.review === "needs-review"
            ? { ...filters, review: "all" }
            : { ...filters, status: "allowed", review: "needs-review" };
    }

    $: reviewScopeHint = filters.review === "needs-review"
        ? `Review mode showing ${visibleDomainFilterCount} visible domain ${visibleDomainFilterCount === 1 ? "filter" : "filters"}. Bulk copy/add applies to visible rows.`
        : `Review list has ${reviewableCount} total ${reviewableCount === 1 ? "candidate" : "candidates"}. Switch to Review to bulk copy or add visible filters.`;
</script>

<div class="glass-header">
    <div class="header-titles">
        <div class="header-kicker">ZenithGuard diagnostics</div>
        <h1>Network Interceptor Log</h1>
        <p class="subtitle">Live requests for tab: <span class="tab-highlight">{context.tabLabel}</span></p>
        <p class="subtitle">This log resets on each full page navigation, so it reflects the current page load instead of old tab history.</p>
    </div>

    <div class="toolbar">
        <div class="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="search-icon" aria-hidden="true">
                <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"></path>
            </svg>
            <input
                type="text"
                placeholder="Filter by URL, type, initiator, rule source, or reason..."
                bind:value={filters.search}
            />
        </div>

        <div class="filter-buttons">
            <button class="filter-btn" class:active-all={filters.status === "all" && filters.review === "all"} on:click={() => setStatusFilter("all")}>All</button>
            <button class="filter-btn" class:active-blocked={filters.status === "blocked"} on:click={() => setStatusFilter("blocked")}>Blocked</button>
            <button class="filter-btn" class:active-modified={filters.status === "modified"} on:click={() => setStatusFilter("modified")}>Cleaned</button>
            <button class="filter-btn" class:active-allowed={filters.status === "allowed" && filters.review === "all"} on:click={() => setStatusFilter("allowed")}>Allowed</button>
            <button class="filter-btn review-filter-btn" class:active-review={filters.review === "needs-review"} on:click={toggleReviewFilter}>
                Review
                {#if reviewableCount > 0}
                    <span class="filter-count" aria-label={`${reviewableCount} requests need review`}>{reviewableCount}</span>
                {/if}
            </button>
        </div>

        <button class="btn-clear" on:click={handleClearLog}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"></path>
            </svg>
            Clear Log
        </button>
        <button class="btn-secondary-action" disabled={reviewableCount === 0} on:click={handleCopyReviewList}>
            {reviewCopyState === "copied" ? "Copied Review List" : "Copy Review List"}
        </button>
        <button class="btn-secondary-action" disabled={visibleDomainFilterCount === 0} on:click={handleCopyDomainFilterList}>
            {getLoggerDomainFilterListCopyLabel(visibleDomainFilterCount, domainFiltersCopyState)}
        </button>
        <button class="btn-secondary-action btn-add-filters" disabled={visibleDomainFilterCount === 0 || addFiltersState === "adding"} on:click={handleAddVisibleFilters}>
            {getLoggerBulkAddFiltersLabel(addFiltersLabelCount, addFiltersState)}
        </button>
        {#if context.tabId}
            <button class="btn-secondary-action" on:click={handleOpenAnalyzer}>Open Analyzer</button>
        {/if}
        <p class="review-scope-hint">{reviewScopeHint}</p>
    </div>
</div>
