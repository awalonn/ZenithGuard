<script lang="ts">
    import { onMount } from "svelte";
    import { openSettings } from "./actions";
    import {
        clearProtectionPauseTimer,
        clearToolActivity,
        copyReviewCandidateList,
        copySiteReportPackage,
        discardTemporaryWallFix,
        openAnalyzer,
        openLogger,
        removeSavedWallFix,
        runPageTool,
        saveTemporaryWallFix,
        removeHiddenRule,
        startInspector,
        stopFocusMode,
        toggleGlobalProtection,
        toggleSitePause,
        toggleSiteRule,
    } from "./actions";
    import { loadPopupSnapshot } from "./loaders";
    import { getToolActivityForHostname } from "./loaders";
    import { attachPopupLiveRefresh } from "./live_refresh";
    import { shouldResetTransientPopupState } from "./session_state";
    import { countReviewCandidates, getReviewCandidateSummaries } from "./site_report";
    import {
        buildSitePolicyState,
        buildWallFixDetails,
        getBestNextMove,
        getBlockerMix,
        getCosmeticCleanupSummary,
        getRecentCosmeticCleanupActivity,
        getRecentNotableActivity,
        getTopSources,
    } from "./state";
    import { getToolActivityFollowUp, getWallFixStatusCard } from "./tool_activity";
    import NavTabs from "./components/NavTabs.svelte";
    import HeroSection from "./components/HeroSection.svelte";
    import HomeTab from "./components/HomeTab.svelte";
    import InsightsTab from "./components/InsightsTab.svelte";
    import ToolsTab from "./components/ToolsTab.svelte";
    import type {
        PopupSnapshot,
        PopupTab,
        PopupToolDefinition,
        ToolActionId,
        ToolActivityEntry,
        ToolStatusCard,
    } from "./types";

    let activeTab: PopupTab = "home";
    let snapshot: PopupSnapshot | null = null;
    let loading = true;
    let actionInFlight = false;
    let busyTool: string | null = null;
    let pageStatusCard: ToolStatusCard | null = null;
    let previousSnapshotScope: {
        tabId: number | null;
        hostname: string;
        pageUrl: string | null;
        isExtensionPage: boolean;
    } | null = null;

    async function refreshSnapshot(): Promise<void> {
        const nextSnapshot = await loadPopupSnapshot();
        if (shouldResetTransientPopupState(previousSnapshotScope, nextSnapshot)) {
            pageStatusCard = null;
            busyTool = null;
        }
        snapshot = nextSnapshot;
        previousSnapshotScope = {
            tabId: nextSnapshot.tabId,
            hostname: nextSnapshot.hostname,
            pageUrl: nextSnapshot.pageUrl,
            isExtensionPage: nextSnapshot.isExtensionPage,
        };
    }

    async function initialize(): Promise<void> {
        loading = true;
        try {
            await refreshSnapshot();
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        let detach = () => {};

        void initialize().then(() => {
            detach = attachPopupLiveRefresh({
                getCurrentTabId: () => snapshot?.tabId ?? null,
                refresh: refreshSnapshot,
            });
        });

        return () => {
            detach();
        };
    });

    $: policy = snapshot ? buildSitePolicyState(snapshot) : null;
    $: blockedEntries = snapshot ? snapshot.networkLog.filter((entry) => entry.status === "blocked") : [];
    $: cleanedEntries = snapshot ? snapshot.networkLog.filter((entry) => entry.status === "modified") : [];
    $: allowedEntries = snapshot ? snapshot.networkLog.filter((entry) => entry.status === "allowed") : [];
    $: notableEntries = snapshot ? getRecentNotableActivity(snapshot.networkLog) : [];
    $: blockerMix = snapshot ? getBlockerMix(snapshot.networkLog) : [];
    $: topSources = snapshot ? getTopSources(snapshot.networkLog) : [];
    $: toolActivity = snapshot
        ? getToolActivityForHostname(snapshot.storage.toolActivityLog, snapshot.hostname).slice(0, 4)
        : [];
    $: wallFixDetails = snapshot ? buildWallFixDetails(snapshot.temporaryWallFix) : [];
    $: suggestedMove = policy ? getBestNextMove(policy) : null;
    $: wallFixCard = snapshot ? getWallFixStatusCard(snapshot.temporaryWallFix, snapshot.hasSavedWallFix) : null;
    $: cookieCard = toolActivity.find((entry) => entry.tool === "Fix Cookies") || null;
    $: recentCosmeticCleanup = getRecentCosmeticCleanupActivity(toolActivity);
    $: cosmeticCleanupSummary = snapshot ? getCosmeticCleanupSummary(snapshot) : null;
    $: reviewCandidateCount = snapshot ? countReviewCandidates(snapshot.networkLog, snapshot.hostname) : 0;
    $: reviewCandidateSummaries = snapshot ? getReviewCandidateSummaries(snapshot.networkLog, snapshot.hostname, 3) : [];

    async function withRefresh(work: () => Promise<void>): Promise<void> {
        actionInFlight = true;
        try {
            await work();
            await refreshSnapshot();
        } finally {
            actionInFlight = false;
        }
    }

    async function handleHeroProtectionToggle(): Promise<void> {
        if (!policy || !snapshot) return;

        if (!snapshot.isExtensionPage) {
            await handleSitePauseToggle();
            return;
        }

        await withRefresh(async () => {
            await toggleGlobalProtection(policy.isProtectionEnabled);
        });
    }

    async function handleSitePauseToggle(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await toggleSitePause(snapshot.hostname, snapshot.tabId);
        });
    }

    async function handleIsolationToggle(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await toggleSiteRule("isolationModeSites", snapshot.hostname, snapshot.tabId);
        });
    }

    async function handleForgetfulToggle(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await toggleSiteRule(
                "forgetfulSites",
                snapshot.hostname,
                snapshot.tabId,
                !policy?.isForgetfulBrowsingEnabled,
            );
        });
    }

    async function handleStopFocusMode(): Promise<void> {
        await withRefresh(async () => {
            await stopFocusMode();
        });
    }

    async function handleOpenAnalyzer(): Promise<void> {
        if (!snapshot?.tabId) return;
        await openAnalyzer(snapshot.tabId);
    }

    async function handleOpenLogger(): Promise<void> {
        if (!snapshot?.tabId) return;
        await openLogger(snapshot.tabId);
    }

    async function handleOpenLoggerReview(): Promise<void> {
        if (!snapshot?.tabId) return;
        await openLogger(snapshot.tabId, true);
    }

    async function handleRunPageTool(tool: PopupToolDefinition): Promise<void> {
        if (!snapshot?.tabId || !policy || actionInFlight) return;

        busyTool = tool.actionType;
        try {
            const result = await runPageTool(tool.actionType, snapshot.tabId, snapshot.hostname);
            pageStatusCard = result;
            await refreshSnapshot();
        } catch (error) {
            pageStatusCard = {
                title: "Tool Failed",
                message: error instanceof Error ? error.message : String(error),
                tone: "error",
            };
        } finally {
            busyTool = null;
        }
    }

    async function runToolAction(action: ToolActionId): Promise<void> {
        if (action === "open-settings") {
            await openSettings();
            return;
        }

        if (action === "review-wall-fix") {
            activeTab = "tools";
            return;
        }

        if (!snapshot?.tabId) {
            return;
        }

        if (action === "open-logger") {
            await openLogger(snapshot.tabId);
            return;
        }

        if (action === "open-logger-review") {
            await openLogger(snapshot.tabId, true);
            return;
        }

        if (action === "open-inspector-wall") {
            await startInspector(snapshot.tabId, "wall-recovery");
            return;
        }

        await startInspector(snapshot.tabId);
    }

    async function handleToolFollowUp(entry: ToolActivityEntry): Promise<void> {
        const followUp = getToolActivityFollowUp(entry);
        if (!followUp) return;
        await runToolAction(followUp.action);
    }

    async function handleStatusCardAction(card: ToolStatusCard): Promise<void> {
        if (!card.action) {
            return;
        }
        await runToolAction(card.action);
    }

    async function handleSuggestedAction(): Promise<void> {
        if (!suggestedMove?.action) {
            return;
        }
        await runToolAction(suggestedMove.action);
    }

    async function handleSaveWallFix(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await saveTemporaryWallFix(snapshot.hostname);
        });
    }

    async function handleDiscardWallFix(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await discardTemporaryWallFix(snapshot.hostname, snapshot.tabId);
        });
    }

    async function handleRemoveWallFix(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await removeSavedWallFix(snapshot.hostname, snapshot.tabId);
        });
    }

    async function handleClearActivity(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await clearToolActivity(snapshot.hostname);
        });
    }

    async function handleCopySiteReport(): Promise<void> {
        if (!snapshot || !policy || snapshot.isExtensionPage) return;

        actionInFlight = true;
        try {
            pageStatusCard = await copySiteReportPackage(snapshot, policy, toolActivity);
        } catch (error) {
            pageStatusCard = {
                title: "Report Copy Failed",
                message: error instanceof Error ? error.message : String(error),
                tone: "error",
            };
        } finally {
            actionInFlight = false;
        }
    }

    async function handleCopyReviewCandidates(): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;

        actionInFlight = true;
        try {
            pageStatusCard = await copyReviewCandidateList(snapshot);
        } catch (error) {
            pageStatusCard = {
                title: "Review Copy Failed",
                message: error instanceof Error ? error.message : String(error),
                tone: "error",
            };
        } finally {
            actionInFlight = false;
        }
    }

    async function handleResumeTimerPause(): Promise<void> {
        await withRefresh(async () => {
            await clearProtectionPauseTimer();
        });
    }

    async function handleOpenInspectorInstead(): Promise<void> {
        if (!snapshot?.tabId) return;
        await startInspector(snapshot.tabId, "wall-recovery");
    }

    async function handleRemoveHiddenRule(index: number): Promise<void> {
        if (!snapshot || snapshot.isExtensionPage) return;
        await withRefresh(async () => {
            await removeHiddenRule(snapshot.hostname, index);
        });
    }
</script>

{#if loading}
    <div class="popup-shell">
        <div class="glass-card">
            <h2>Loading ZenithGuard...</h2>
        </div>
    </div>
{:else if policy?.isPausedByTimer}
    <div class="popup-shell paused-shell">
        <div class="glass-card">
            <h2>Protection Paused</h2>
            <p>Protection is temporarily paused. Resume it now to restore normal blocking.</p>
            <button class="primary-btn" on:click={handleResumeTimerPause}>Resume Now</button>
        </div>
    </div>
{:else if snapshot && policy}
    <div class="popup-shell">
        <HeroSection
            hostname={snapshot.hostname}
            {policy}
            onOpenSettings={openSettings}
            onToggleProtection={handleHeroProtectionToggle}
        />

        <NavTabs {activeTab} onChange={(tab) => activeTab = tab} />

        <div class="content-area">
            {#if activeTab === "home"}
                <HomeTab
                    {policy}
                    {snapshot}
                    blockedCount={blockedEntries.length}
                    cleanedCount={cleanedEntries.length}
                    {recentCosmeticCleanup}
                    {cosmeticCleanupSummary}
                    onStopFocusMode={handleStopFocusMode}
                    onOpenAnalyzer={handleOpenAnalyzer}
                />
            {/if}

            {#if activeTab === "insights"}
                <InsightsTab
                    {snapshot}
                    blockedCount={blockedEntries.length}
                    cleanedCount={cleanedEntries.length}
                    trackerCount={snapshot.privacyStats.trackersDetected || 0}
                    {blockerMix}
                    {topSources}
                    {notableEntries}
                    onOpenAnalyzer={handleOpenAnalyzer}
                    onOpenLogger={handleOpenLogger}
                />
            {/if}

            {#if activeTab === "tools"}
                <ToolsTab
                    {snapshot}
                    {policy}
                    {pageStatusCard}
                    {toolActivity}
                    {wallFixCard}
                    {cookieCard}
                    {suggestedMove}
                    {wallFixDetails}
                    {busyTool}
                    {reviewCandidateCount}
                    {reviewCandidateSummaries}
                    onClearActivity={handleClearActivity}
                    onToolFollowUp={handleToolFollowUp}
                    onStatusCardAction={handleStatusCardAction}
                    onSuggestedAction={handleSuggestedAction}
                    onRunPageTool={handleRunPageTool}
                    onIsolationToggle={handleIsolationToggle}
                    onForgetfulToggle={handleForgetfulToggle}
                    onSitePauseToggle={handleSitePauseToggle}
                    onCopySiteReport={handleCopySiteReport}
                    onCopyReviewCandidates={handleCopyReviewCandidates}
                    onOpenLogger={handleOpenLogger}
                    onOpenLoggerReview={handleOpenLoggerReview}
                    onSaveWallFix={handleSaveWallFix}
                    onDiscardWallFix={handleDiscardWallFix}
                    onOpenInspectorInstead={handleOpenInspectorInstead}
                    onRemoveWallFix={handleRemoveWallFix}
                    onRemoveHiddenRule={handleRemoveHiddenRule}
                />
            {/if}
        </div>
    </div>
{/if}
