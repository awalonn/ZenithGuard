<script lang="ts">
    import { onMount } from "svelte";
    import { CORE_PROTECTION_SETTINGS, GEMINI_MODEL_PRESETS, SETTINGS_NAV_ITEMS } from "./config";
    import { loadDashboardSnapshot, loadExtensionHealthSnapshot, loadMalwareFeedStatus, loadRulesSnapshot, loadSettingsSnapshot } from "./loaders";
    import { attachSettingsLiveRefresh } from "./live_refresh";
    import Sidebar from "./components/Sidebar.svelte";
    import DashboardSection from "./components/DashboardSection.svelte";
    import GeneralSettingsSection from "./components/GeneralSettingsSection.svelte";
    import RulesSection from "./components/RulesSection.svelte";
    import AboutSection from "./components/AboutSection.svelte";
    import {
        addLocalAiCandidateToBlocklist,
        applySettingsTheme,
        buildExtensionDiagnosticsPreview,
        buildExtensionDiagnosticsReport,
        createDefaultSettingsSnapshot,
        detectDomainCandidate,
        downloadExtensionDiagnosticsReport,
        exportSettingsSnapshot,
        getInitialLocalAiBlockActionState,
        importSettingsSnapshot,
        isLocalAiTestAvailable,
        loadActiveTabDiagnosticsContext,
        loadDiagnosticsNetworkSummary,
        openDiagnosticsSiteAnalyzer,
        openDiagnosticsSiteLogger,
        persistThemeMode,
        previewSettingsImport,
        reEnableGlobalProtection,
        resumeProtection,
        runLocalAiClassification,
        saveGeminiApiKey,
        saveGeminiModel,
        saveGeminiModelOverride,
        toggleCoreSetting,
    } from "./settings_controller";
    import type { SettingsImportPreview } from "./settings_controller";
    import type {
        LocalAiBlockActionState,
        LocalAiClassificationResult,
        ExtensionHealthSnapshot,
        ActiveTabDiagnosticsContext,
        DiagnosticsNetworkSummary,
        DiagnosticsPreviewItem,
        SettingsDashboardSnapshot,
        MalwareFeedStatus,
        SettingsRuleSnapshot,
        SettingsSectionId,
        SettingsSnapshot,
        CoreSettingId,
    } from "./types";

    let activeSection: SettingsSectionId = "dashboard";
    let isDarkMode = true;
    let settings: SettingsSnapshot = createDefaultSettingsSnapshot();
    let rulesSnapshot: SettingsRuleSnapshot | null = null;
    let malwareFeed: MalwareFeedStatus = {
        remoteSourceLabel: "Loading...",
        bundledSeedPath: "Loading...",
        cachedDomains: 0,
        lastUpdated: null,
    };
    let dashboard: SettingsDashboardSnapshot = {
        toolActivityToday: 0,
        customNetworkRules: 0,
        enabledCoreRules: 0,
    };
    let health: ExtensionHealthSnapshot = {
        status: "attention",
        statusLabel: "Loading",
        issues: ["Health checks are still loading."],
        extensionId: "",
        manifestVersion: "",
        enabledRulesets: [],
        dynamicRuleCount: 0,
        staticCoreEnabled: false,
        youtubeRulesEnabled: false,
        youtubeRulesExpected: true,
        settingsInitialized: false,
        protectionEnabled: false,
        defaultOverrideCount: 0,
        pausedUntil: null,
        sessionAllowlistCount: 0,
        disabledSiteCount: 0,
    };
    let diagnosticsSiteContext: ActiveTabDiagnosticsContext | null = null;
    let diagnosticsNetworkSummary: DiagnosticsNetworkSummary | null = null;
    let diagnosticsPreview: DiagnosticsPreviewItem[] = [];

    let apiKey = "";
    let geminiModel = "gemini-2.5-flash";
    let geminiModelOverride = "";
    let localAiText = "url: https://connect.facebook.net/en_US/fbevents.js";
    let localAiLoading = false;
    let localAiResult: LocalAiClassificationResult | null = null;
    let localAiBlockAction: LocalAiBlockActionState = {
        candidateDomain: null,
        isEligible: false,
        isLoading: false,
        isAdded: false,
        message: "",
    };
    let backupStatusMessage = "";
    let backupBusy = false;
    let pendingImportFile: File | null = null;
    let pendingImportPreview: SettingsImportPreview | null = null;
    let diagnosticsStatusMessage = "";
    let diagnosticsCopyBusy = false;
    let diagnosticsDownloadBusy = false;
    let diagnosticsAnalyzerBusy = false;
    let diagnosticsLoggerBusy = false;
    let healthRefreshBusy = false;
    let healthRepairStatusMessage = "";
    let healthRepairBusy = false;
    let importInput: HTMLInputElement | null = null;

    async function refresh(): Promise<void> {
        const [nextSettings, nextRules, nextMalwareFeed, nextDashboard, nextHealth, nextDiagnosticsSiteContext, keySnapshot] = await Promise.all([
            loadSettingsSnapshot(),
            loadRulesSnapshot(),
            loadMalwareFeedStatus(),
            loadDashboardSnapshot(),
            loadExtensionHealthSnapshot(),
            loadActiveTabDiagnosticsContext(),
            chrome.storage.sync.get(["geminiApiKey", "geminiModel", "geminiModelOverride"]),
        ]);

        settings = nextSettings;
        rulesSnapshot = nextRules;
        malwareFeed = nextMalwareFeed;
        dashboard = nextDashboard;
        health = nextHealth;
        diagnosticsSiteContext = nextDiagnosticsSiteContext;
        diagnosticsNetworkSummary = await loadDiagnosticsNetworkSummary(nextDiagnosticsSiteContext);
        isDarkMode = settings.theme !== "light";
        apiKey = typeof keySnapshot.geminiApiKey === "string" ? keySnapshot.geminiApiKey : "";
        geminiModel = typeof keySnapshot.geminiModel === "string" ? keySnapshot.geminiModel : "gemini-2.5-flash";
        geminiModelOverride = typeof keySnapshot.geminiModelOverride === "string" ? keySnapshot.geminiModelOverride : "";
        applySettingsTheme(isDarkMode);
    }

    onMount(() => {
        let detach = () => {};
        const params = new URLSearchParams(window.location.search);
        const section = params.get("section");
        if (section === "dashboard" || section === "general-settings" || section === "my-rules" || section === "about") {
            activeSection = section;
        }

        void refresh().then(() => {
            detach = attachSettingsLiveRefresh({ refresh });
        });

        return () => {
            detach();
        };
    });

    $: localAiAvailable = isLocalAiTestAvailable(settings);
    $: totalBlocksToday = dashboard.toolActivityToday;
    $: totalTrackers = dashboard.customNetworkRules;
    $: totalAds = dashboard.enabledCoreRules;
    $: diagnosticsPreview = buildExtensionDiagnosticsPreview(health, diagnosticsSiteContext, diagnosticsNetworkSummary, dashboard);

    async function handleThemeToggle(): Promise<void> {
        isDarkMode = !isDarkMode;
        await persistThemeMode(isDarkMode);
        settings = { ...settings, theme: isDarkMode ? "dark" : "light" };
    }

    function isCoreSettingId(settingId: keyof SettingsSnapshot): settingId is CoreSettingId {
        return settingId !== "theme";
    }

    async function handleSettingToggle(settingId: keyof SettingsSnapshot): Promise<void> {
        if (!isCoreSettingId(settingId)) {
            return;
        }

        settings = await toggleCoreSetting(settings, settingId);
    }

    async function handleSaveApiKey(): Promise<void> {
        await saveGeminiApiKey(apiKey);
    }

    async function handleSaveGeminiModel(): Promise<void> {
        await saveGeminiModel(geminiModel);
    }

    async function handleSaveGeminiModelOverride(): Promise<void> {
        await saveGeminiModelOverride(geminiModelOverride);
    }

    async function handleRunLocalAi(): Promise<void> {
        localAiLoading = true;
        localAiResult = await runLocalAiClassification(localAiText, localAiAvailable);
        localAiBlockAction = getInitialLocalAiBlockActionState(detectDomainCandidate(localAiText), localAiResult);
        localAiLoading = false;
    }

    async function handleAddLocalAiToBlocklist(): Promise<void> {
        if (!localAiBlockAction.candidateDomain) {
            return;
        }

        localAiBlockAction = { ...localAiBlockAction, isLoading: true };
        const result = await addLocalAiCandidateToBlocklist(localAiBlockAction.candidateDomain);
        localAiBlockAction = {
            ...localAiBlockAction,
            isLoading: false,
            isAdded: result.success,
            message: result.message,
        };
    }

    async function handleExportSettings(): Promise<void> {
        backupBusy = true;
        pendingImportFile = null;
        pendingImportPreview = null;
        try {
            backupStatusMessage = await exportSettingsSnapshot();
        } catch (error) {
            backupStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            backupBusy = false;
        }
    }

    async function handleImportSettings(): Promise<void> {
        importInput?.click();
    }

    async function handleImportFileChange(event: Event): Promise<void> {
        const target = event.currentTarget as HTMLInputElement | null;
        const file = target?.files?.[0] || null;
        if (!file) {
            return;
        }

        backupBusy = true;
        try {
            pendingImportPreview = await previewSettingsImport(file);
            pendingImportFile = file;
            backupStatusMessage = pendingImportPreview.message;
        } catch (error) {
            pendingImportFile = null;
            pendingImportPreview = null;
            backupStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            backupBusy = false;
            if (target) {
                target.value = "";
            }
        }
    }

    async function handleConfirmImportSettings(): Promise<void> {
        if (!pendingImportFile) {
            return;
        }

        backupBusy = true;
        try {
            backupStatusMessage = await importSettingsSnapshot(pendingImportFile);
            pendingImportFile = null;
            pendingImportPreview = null;
            await refresh();
        } catch (error) {
            backupStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            backupBusy = false;
        }
    }

    function handleCancelImportSettings(): void {
        pendingImportFile = null;
        pendingImportPreview = null;
        backupStatusMessage = "Import canceled.";
    }

    async function copyTextToClipboard(text: string): Promise<void> {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("Clipboard API unavailable.");
            }

            await navigator.clipboard.writeText(text);
            return;
        } catch (clipboardError) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.setAttribute("readonly", "true");
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.select();

            try {
                if (!document.execCommand("copy")) {
                    throw clipboardError;
                }
            } finally {
                document.body.removeChild(textArea);
            }
        }
    }

    async function handleCopyDiagnostics(): Promise<void> {
        diagnosticsCopyBusy = true;
        try {
            const activeTabContext = await loadActiveTabDiagnosticsContext();
            const networkSummary = await loadDiagnosticsNetworkSummary(activeTabContext);
            diagnosticsSiteContext = activeTabContext;
            diagnosticsNetworkSummary = networkSummary;
            const report = buildExtensionDiagnosticsReport(health, {
                activeTabContext,
                dashboard,
                networkSummary,
                userAgent: navigator.userAgent,
            });
            await copyTextToClipboard(report);
            diagnosticsStatusMessage = "Copied extension diagnostics.";
        } catch (error) {
            diagnosticsStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            diagnosticsCopyBusy = false;
        }
    }

    async function handleDownloadDiagnostics(): Promise<void> {
        diagnosticsDownloadBusy = true;
        try {
            const activeTabContext = await loadActiveTabDiagnosticsContext();
            const networkSummary = await loadDiagnosticsNetworkSummary(activeTabContext);
            diagnosticsSiteContext = activeTabContext;
            diagnosticsNetworkSummary = networkSummary;
            const report = buildExtensionDiagnosticsReport(health, {
                activeTabContext,
                dashboard,
                networkSummary,
                userAgent: navigator.userAgent,
            });
            downloadExtensionDiagnosticsReport(report);
            diagnosticsStatusMessage = "Started diagnostics download.";
        } catch (error) {
            diagnosticsStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            diagnosticsDownloadBusy = false;
        }
    }

    async function handleRefreshHealth(): Promise<void> {
        healthRefreshBusy = true;
        try {
            await refresh();
            diagnosticsStatusMessage = "Health refreshed.";
        } catch (error) {
            diagnosticsStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            healthRefreshBusy = false;
        }
    }

    async function handleOpenDiagnosticsLogger(): Promise<void> {
        diagnosticsLoggerBusy = true;
        try {
            let activeTabContext = diagnosticsSiteContext;
            if (activeTabContext?.source !== "recent-web-tab") {
                activeTabContext = await loadActiveTabDiagnosticsContext();
                diagnosticsSiteContext = activeTabContext;
            }

            diagnosticsStatusMessage = await openDiagnosticsSiteLogger(activeTabContext);
        } catch (error) {
            diagnosticsStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            diagnosticsLoggerBusy = false;
        }
    }

    async function handleOpenDiagnosticsAnalyzer(): Promise<void> {
        diagnosticsAnalyzerBusy = true;
        try {
            let activeTabContext = diagnosticsSiteContext;
            if (activeTabContext?.source !== "recent-web-tab") {
                activeTabContext = await loadActiveTabDiagnosticsContext();
                diagnosticsSiteContext = activeTabContext;
            }

            diagnosticsStatusMessage = await openDiagnosticsSiteAnalyzer(activeTabContext);
        } catch (error) {
            diagnosticsStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            diagnosticsAnalyzerBusy = false;
        }
    }

    async function handleReEnableProtection(): Promise<void> {
        healthRepairBusy = true;
        try {
            healthRepairStatusMessage = await reEnableGlobalProtection();
            await refresh();
        } catch (error) {
            healthRepairStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            healthRepairBusy = false;
        }
    }

    async function handleResumeProtection(): Promise<void> {
        healthRepairBusy = true;
        try {
            healthRepairStatusMessage = await resumeProtection();
            await refresh();
        } catch (error) {
            healthRepairStatusMessage = error instanceof Error ? error.message : String(error);
        } finally {
            healthRepairBusy = false;
        }
    }

</script>

<div class:light-theme={!isDarkMode} class="settings-container zg-settings-shell">
    <input
        bind:this={importInput}
        type="file"
        accept="application/json"
        style="display: none"
        on:change={handleImportFileChange}
    />
    <Sidebar
        items={SETTINGS_NAV_ITEMS}
        {activeSection}
        {isDarkMode}
        onSectionChange={(section) => activeSection = section}
        onToggleTheme={handleThemeToggle}
    />

    <main class="main-content">
        <div class="content-shell">
            {#if activeSection === "dashboard"}
                <DashboardSection
                    blocksToday={totalBlocksToday}
                    {totalTrackers}
                    {totalAds}
                    {health}
                    {diagnosticsSiteContext}
                    {diagnosticsNetworkSummary}
                    {diagnosticsPreview}
                    {diagnosticsStatusMessage}
                    {diagnosticsCopyBusy}
                    {diagnosticsDownloadBusy}
                    {diagnosticsAnalyzerBusy}
                    {diagnosticsLoggerBusy}
                    {healthRefreshBusy}
                    {healthRepairStatusMessage}
                    {healthRepairBusy}
                    onRefreshHealth={handleRefreshHealth}
                    onOpenDiagnosticsAnalyzer={handleOpenDiagnosticsAnalyzer}
                    onOpenDiagnosticsLogger={handleOpenDiagnosticsLogger}
                    onCopyDiagnostics={handleCopyDiagnostics}
                    onDownloadDiagnostics={handleDownloadDiagnostics}
                    onReEnableProtection={handleReEnableProtection}
                    onResumeProtection={handleResumeProtection}
                />
            {/if}

            {#if activeSection === "general-settings"}
                <GeneralSettingsSection
                    {settings}
                    {malwareFeed}
                    coreProtectionSettings={CORE_PROTECTION_SETTINGS}
                    geminiModelPresets={GEMINI_MODEL_PRESETS}
                    isLocalAiTestAvailable={localAiAvailable}
                    bind:apiKey
                    bind:geminiModel
                    bind:geminiModelOverride
                    bind:localAiText
                    {localAiLoading}
                    {localAiResult}
                    {localAiBlockAction}
                    onToggleSetting={handleSettingToggle}
                    onSaveApiKey={handleSaveApiKey}
                    onSaveGeminiModel={handleSaveGeminiModel}
                    onSaveGeminiModelOverride={handleSaveGeminiModelOverride}
                    onRunLocalAi={handleRunLocalAi}
                    onAddLocalAiToBlocklist={handleAddLocalAiToBlocklist}
                    onExportSettings={handleExportSettings}
                    onImportSettings={handleImportSettings}
                    onConfirmImportSettings={handleConfirmImportSettings}
                    onCancelImportSettings={handleCancelImportSettings}
                    {pendingImportPreview}
                    {backupStatusMessage}
                    {backupBusy}
                />
            {/if}

            {#if activeSection === "my-rules"}
                <RulesSection {rulesSnapshot} />
            {/if}

            {#if activeSection === "about"}
                <AboutSection />
            {/if}
        </div>
    </main>
</div>

