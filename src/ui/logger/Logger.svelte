<script lang="ts">
    import { onMount } from "svelte";
    import { loadLoggerContext, loadLoggerEntries, loadLoggerSupportData } from "./loaders";
    import { attachLoggerLiveRefresh } from "./live_refresh";
    import {
        addLoggerEntryToBlocklist,
        addLoggerVisibleFiltersToBlocklist,
        attachDynamicLoggerMessageListener,
        buildLoggerDomainFilter,
        buildLoggerDomainFilterList,
        buildLoggerReviewList,
        clearLogger,
        filterLoggerEntries,
        getActiveFilterTags,
        getLoggerCoverage,
        getLoggerDomainFilterListCount,
        getLoggerReviewCount,
        getLoggerStats,
        manageLoggerEntryInRules,
        mapVisibleEntry,
        openLoggerAnalyzer,
        removeLoggerCustomBlock,
        undoLoggerBulkAddedFilters,
    } from "./logger_controller";
    import type { LoggerContext, LoggerEntry, LoggerFilterState, LoggerLogSnapshot, LoggerSupportData, LoggerVisibleEntry } from "./types";
    import LoggerHeader from "./components/LoggerHeader.svelte";
    import LoggerStatsCoverage from "./components/LoggerStatsCoverage.svelte";
    import LoggerTable from "./components/LoggerTable.svelte";

    const pinnedQueryTabId = (() => {
        const value = new URLSearchParams(window.location.search).get("tabId");
        if (!value) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    })();

    let context: LoggerContext = {
        tabId: null,
        tabLabel: "Loading...",
        initialSearch: "",
        initialSource: null,
        initialStatus: "all",
        initialReview: "all",
    };

    let supportData: LoggerSupportData = {
        networkBlocklist: [],
        defaultBlocklist: [],
        networkBlocklistMeta: {},
    };
    let snapshot: LoggerLogSnapshot = {
        entries: [],
        sessionStartedAt: null,
        lastUpdatedAt: null,
    };

    let entries: LoggerEntry[] = [];
    let mappedEntries: LoggerVisibleEntry[] = [];
    let visibleEntries: LoggerVisibleEntry[] = [];
    let filters: LoggerFilterState = {
        search: "",
        status: "all",
        review: "all",
        family: "all",
        source: null,
    };

    let inlineError = "";
    let inlineStatus = "";
    let pendingAddDomain = "";
    let pendingRemoveValue = "";
    let copiedDomainFilterEntryId: number | null = null;
    let reviewCopyState: "" | "copied" = "";
    let domainFiltersCopyState: "" | "copied" = "";
    let addFiltersState: "" | "confirming" | "adding" | "added" = "";
    let visibleDomainFilterCount = 0;
    let addFiltersLabelCount = 0;
    let lastBulkAddCount = 0;
    let lastBulkAddedFilters: string[] = [];
    let addFiltersConfirmTimeout: number | null = null;
    let stats = getLoggerStats([], [], null);
    let coverage = getLoggerCoverage([]);
    let reviewableCount = 0;
    let activeFilterTags = getActiveFilterTags(filters);

    function rebuildVisibleEntries(): void {
        mappedEntries = entries.map((entry) => mapVisibleEntry(entry, supportData));
        reviewableCount = getLoggerReviewCount(mappedEntries);
        visibleEntries = filterLoggerEntries(mappedEntries, filters);
        visibleDomainFilterCount = getLoggerDomainFilterListCount(visibleEntries);
    }

    async function copyTextToClipboard(text: string): Promise<void> {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard API unavailable.");
            }

            await navigator.clipboard.writeText(text);
        } catch (clipboardError) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "true");
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            try {
                if (!document.execCommand("copy")) {
                    throw clipboardError;
                }
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }

    async function refreshContext(): Promise<void> {
        const nextContext = await loadLoggerContext();
        context = {
            ...context,
            tabId: nextContext.tabId,
            tabLabel: nextContext.tabLabel,
        };
    }

    async function refreshSupportData(): Promise<void> {
        supportData = await loadLoggerSupportData();
    }

    async function clearSnapshot(): Promise<void> {
        entries = [];
        visibleEntries = [];
        snapshot = {
            entries: [],
            sessionStartedAt: null,
            lastUpdatedAt: null,
        };
    }

    async function refreshAll(): Promise<void> {
        [context, supportData] = await Promise.all([
            loadLoggerContext(),
            loadLoggerSupportData(),
        ]);

        filters = {
            search: context.initialSearch,
            status: context.initialReview === "needs-review" ? "allowed" : context.initialStatus,
            review: context.initialReview,
            family: "all",
            source: context.initialSource,
        };

        snapshot = context.tabId ? await loadLoggerEntries(context.tabId) : {
            entries: [],
            sessionStartedAt: null,
            lastUpdatedAt: null,
        };
        entries = snapshot.entries;
        rebuildVisibleEntries();
    }

    onMount(() => {
        let detachMessages = () => {};
        let detachLiveRefresh = () => {};

        void refreshAll().then(() => {
            detachMessages = attachDynamicLoggerMessageListener(() => context.tabId, (entry) => {
                const index = entries.findIndex((candidate) => candidate.id === entry.id);
                if (index >= 0) {
                    entries[index] = entry;
                    entries = [...entries];
                } else {
                    entries = [entry, ...entries];
                }
                snapshot = {
                    ...snapshot,
                    entries,
                    lastUpdatedAt: entry.timestamp,
                };
                rebuildVisibleEntries();
            }, (sessionStartedAt) => {
                entries = [];
                visibleEntries = [];
                snapshot = {
                    entries: [],
                    sessionStartedAt,
                    lastUpdatedAt: null,
                };
            });

            detachLiveRefresh = attachLoggerLiveRefresh({
                followActiveTab: pinnedQueryTabId === null,
                getCurrentTabId: () => context.tabId,
                refreshAll,
                refreshSupportData,
                refreshContext,
                clearSnapshot,
            });
        });

        return () => {
            detachMessages();
            detachLiveRefresh();
        };
    });

    $: {
        entries;
        filters;
        supportData;
        rebuildVisibleEntries();
    }

    $: stats = getLoggerStats(entries, visibleEntries, context.tabId, snapshot.sessionStartedAt, snapshot.lastUpdatedAt);
    $: coverage = getLoggerCoverage(entries);
    $: activeFilterTags = getActiveFilterTags(filters);
    $: addFiltersLabelCount = addFiltersState ? lastBulkAddCount || visibleDomainFilterCount : visibleDomainFilterCount;
    $: if (addFiltersState === "confirming" && lastBulkAddCount !== visibleDomainFilterCount) {
        resetAddFiltersConfirmation();
    }

    async function handleClearLog(): Promise<void> {
        if (!context.tabId) {
            return;
        }

        await clearLogger(context.tabId);
        entries = [];
        visibleEntries = [];
        snapshot = {
            ...snapshot,
            entries: [],
            lastUpdatedAt: null,
        };
    }

    function resetFilters(): void {
        filters = {
            search: "",
            status: "all",
            review: "all",
            family: "all",
            source: null,
        };
    }

    async function handleAddCustomBlock(entry: LoggerVisibleEntry): Promise<void> {
        const candidate = entry.customBlockCandidate || entry.domain;
        if (!candidate || pendingAddDomain === candidate) {
            return;
        }

        inlineError = "";
        inlineStatus = "";
        pendingAddDomain = candidate;

        const result = await addLoggerEntryToBlocklist(entry);
        pendingAddDomain = "";

        if (!result.success) {
            inlineError = result.message || "Could not add this custom block.";
            return;
        }

        await refreshAll();
    }

    async function handleRemoveCustomBlock(entry: LoggerVisibleEntry): Promise<void> {
        if (!entry.customMatchedValue || pendingRemoveValue === entry.customMatchedValue) {
            return;
        }

        inlineError = "";
        inlineStatus = "";
        pendingRemoveValue = entry.customMatchedValue;

        try {
            await removeLoggerCustomBlock(entry);
            await refreshAll();
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
        } finally {
            pendingRemoveValue = "";
        }
    }

    async function handleCopyDomainFilter(entry: LoggerVisibleEntry): Promise<void> {
        const filter = buildLoggerDomainFilter(entry);
        if (!filter) {
            inlineError = "No domain filter available for this request.";
            return;
        }

        inlineError = "";
        inlineStatus = "";
        try {
            await copyTextToClipboard(filter);
            copiedDomainFilterEntryId = entry.id;
            window.setTimeout(() => {
                if (copiedDomainFilterEntryId === entry.id) {
                    copiedDomainFilterEntryId = null;
                }
            }, 1600);
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
        }
    }

    async function handleCopyReviewList(): Promise<void> {
        const report = buildLoggerReviewList(mappedEntries, context.tabLabel);
        if (!report) {
            inlineError = "No reviewable requests to copy.";
            return;
        }

        inlineError = "";
        inlineStatus = "";
        try {
            await copyTextToClipboard(report);
            reviewCopyState = "copied";
            window.setTimeout(() => {
                reviewCopyState = "";
            }, 1600);
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
        }
    }

    async function handleCopyDomainFilterList(): Promise<void> {
        const filtersToCopy = buildLoggerDomainFilterList(visibleEntries);
        if (!filtersToCopy) {
            inlineError = "No visible reviewable domain filters to copy.";
            return;
        }

        inlineError = "";
        inlineStatus = "";
        try {
            await copyTextToClipboard(filtersToCopy);
            domainFiltersCopyState = "copied";
            window.setTimeout(() => {
                domainFiltersCopyState = "";
            }, 1600);
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
        }
    }

    function resetAddFiltersConfirmation(): void {
        if (addFiltersConfirmTimeout !== null) {
            window.clearTimeout(addFiltersConfirmTimeout);
            addFiltersConfirmTimeout = null;
        }
        addFiltersState = "";
        lastBulkAddCount = 0;
    }

    async function handleAddVisibleFilters(): Promise<void> {
        if (addFiltersState === "adding") {
            return;
        }

        if (addFiltersState !== "confirming") {
            inlineError = "";
            inlineStatus = "";
            lastBulkAddCount = visibleDomainFilterCount;
            addFiltersState = "confirming";
            if (addFiltersConfirmTimeout !== null) {
                window.clearTimeout(addFiltersConfirmTimeout);
            }
            addFiltersConfirmTimeout = window.setTimeout(() => {
                resetAddFiltersConfirmation();
            }, 3200);
            return;
        }

        if (addFiltersConfirmTimeout !== null) {
            window.clearTimeout(addFiltersConfirmTimeout);
            addFiltersConfirmTimeout = null;
        }

        inlineError = "";
        inlineStatus = "";
        addFiltersState = "adding";
        try {
            const result = await addLoggerVisibleFiltersToBlocklist(visibleEntries);
            if (!result.success) {
                inlineError = result.message || "No visible reviewable filters to add.";
                addFiltersState = "";
                lastBulkAddCount = 0;
                return;
            }

            lastBulkAddCount = result.added;
            lastBulkAddedFilters = result.addedFilters;
            inlineStatus = result.message || `Added ${result.added} ${result.added === 1 ? "filter" : "filters"}.`;
            addFiltersState = "added";
            await refreshSupportData();
            rebuildVisibleEntries();
            window.setTimeout(() => {
                addFiltersState = "";
                lastBulkAddCount = 0;
            }, 1600);
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
            addFiltersState = "";
            lastBulkAddCount = 0;
        }
    }

    async function handleUndoBulkAdd(): Promise<void> {
        if (lastBulkAddedFilters.length === 0) {
            inlineError = "No recent bulk-added filters to undo.";
            inlineStatus = "";
            return;
        }

        inlineError = "";
        try {
            const result = await undoLoggerBulkAddedFilters(lastBulkAddedFilters);
            if (!result.success) {
                inlineError = result.message || "Could not undo the last bulk add.";
                inlineStatus = "";
                return;
            }

            inlineStatus = result.message || `Removed ${result.removed} ${result.removed === 1 ? "filter" : "filters"}.`;
            lastBulkAddedFilters = [];
            addFiltersState = "";
            lastBulkAddCount = 0;
            await refreshSupportData();
            rebuildVisibleEntries();
        } catch (error) {
            inlineError = error instanceof Error ? error.message : String(error);
            inlineStatus = "";
        }
    }
</script>

<div class="logger-layout zg-logger-shell">
    <LoggerHeader
        {context}
        bind:filters
        {reviewableCount}
        {reviewCopyState}
        {domainFiltersCopyState}
        {addFiltersState}
        {visibleDomainFilterCount}
        {addFiltersLabelCount}
        {handleClearLog}
        {handleCopyReviewList}
        {handleCopyDomainFilterList}
        {handleAddVisibleFilters}
        handleOpenAnalyzer={() => openLoggerAnalyzer(context.tabId)}
    />

    <LoggerStatsCoverage
        {stats}
        {coverage}
        bind:filters
        {activeFilterTags}
        {resetFilters}
    />

    <LoggerTable
        {visibleEntries}
        {entries}
        {inlineError}
        {inlineStatus}
        canUndoLastBulkAdd={lastBulkAddedFilters.length > 0}
        {pendingAddDomain}
        {pendingRemoveValue}
        {copiedDomainFilterEntryId}
        handleManageInRules={manageLoggerEntryInRules}
        {handleAddCustomBlock}
        {handleRemoveCustomBlock}
        {handleCopyDomainFilter}
        {handleUndoBulkAdd}
    />
</div>
