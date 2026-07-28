<script lang="ts">
    import type { ActiveTabDiagnosticsContext, DiagnosticsNetworkSummary, DiagnosticsPreviewItem, ExtensionHealthSnapshot } from "../types";

    export let blocksToday = 0;
    export let totalTrackers = 0;
    export let totalAds = 0;
    export let health: ExtensionHealthSnapshot;
    export let diagnosticsSiteContext: ActiveTabDiagnosticsContext | null = null;
    export let diagnosticsNetworkSummary: DiagnosticsNetworkSummary | null = null;
    export let diagnosticsPreview: DiagnosticsPreviewItem[] = [];
    export let diagnosticsStatusMessage = "";
    export let diagnosticsCopyBusy = false;
    export let diagnosticsDownloadBusy = false;
    export let diagnosticsAnalyzerBusy = false;
    export let diagnosticsLoggerBusy = false;
    export let healthRefreshBusy = false;
    export let healthRepairStatusMessage = "";
    export let healthRepairBusy = false;
    export let onRefreshHealth: () => Promise<void> | void = () => {};
    export let onOpenDiagnosticsAnalyzer: () => Promise<void> | void = () => {};
    export let onOpenDiagnosticsLogger: () => Promise<void> | void = () => {};
    export let onCopyDiagnostics: () => Promise<void> | void = () => {};
    export let onDownloadDiagnostics: () => Promise<void> | void = () => {};
    export let onReEnableProtection: () => Promise<void> | void = () => {};
    export let onResumeProtection: () => Promise<void> | void = () => {};

    $: totalInterventions = blocksToday + totalTrackers + totalAds;
    $: profileStatus = totalInterventions === 0
        ? "Quiet Start"
        : totalInterventions < 25
            ? "Light Activity"
            : totalInterventions < 100
                ? "Active Protection"
                : "Heavy Protection";
    $: enabledRulesetLabel = health.enabledRulesets.length > 0 ? health.enabledRulesets.join(", ") : "None";
    $: pauseLabel = health.pausedUntil && health.pausedUntil > Date.now()
        ? new Date(health.pausedUntil).toLocaleString()
        : "Not paused";
    $: isProtectionPaused = Boolean(health.pausedUntil && health.pausedUntil > Date.now());
    $: diagnosticsSiteLabel = diagnosticsSiteContext?.source === "recent-web-tab"
        ? diagnosticsSiteContext.domain || diagnosticsSiteContext.hostname
        : "No web tab";
    $: diagnosticsSiteTitle = diagnosticsSiteContext?.source === "recent-web-tab"
        ? diagnosticsSiteContext.redactedUrl
        : "No current-window web tab is available for diagnostics context.";
    $: canOpenDiagnosticsLogger = diagnosticsSiteContext?.source === "recent-web-tab"
        && typeof diagnosticsSiteContext.tabId === "number";
    $: diagnosticsNetworkLabel = diagnosticsNetworkSummary?.source === "tab-log"
        ? `${diagnosticsNetworkSummary.totalEntries}`
        : "Unavailable";
    $: diagnosticsNetworkTitle = diagnosticsNetworkSummary?.source === "tab-log"
        ? `${diagnosticsNetworkSummary.blockedEntries} blocked, ${diagnosticsNetworkSummary.allowedEntries} allowed, ${diagnosticsNetworkSummary.modifiedEntries} modified`
        : "No diagnostics tab network log is available.";
</script>

<section class="content-section active">
    <div class="content-header page-header">
        <div>
            <span class="page-kicker">Overview</span>
            <h1>Dashboard</h1>
            <p class="page-subtitle">A quick read on how much ZenithGuard has already stepped in across this browser profile.</p>
        </div>
        <span class="section-tag neutral">Live Snapshot</span>
    </div>

    <div class="info-box dashboard-intro">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="M9 12l2 2 4-4"></path>
        </svg>
        <p><strong>Protection snapshot.</strong> These numbers reflect saved activity and configured rule counts. They are a quick read on what ZenithGuard has recorded and how much protection is currently enabled in this browser profile.</p>
    </div>

    <article class="stat-card dashboard-hero-card">
        <div class="dashboard-hero-copy">
            <span class="dashboard-metric-kicker">Profile Status</span>
            <h2>{profileStatus}</h2>
            <p>This is the current overall posture based on today's saved tool activity plus the protection rules currently enabled in this browser.</p>
        </div>
        <div class="dashboard-hero-metrics">
            <div class="summary-pill">
                <span class="summary-label">Total Snapshot</span>
                <strong>{totalInterventions}</strong>
                <span class="summary-copy">Today's saved activity plus enabled custom and built-in rule counts.</span>
            </div>
            <div class="summary-pill">
                <span class="summary-label">Today</span>
                <strong>{blocksToday}</strong>
                <span class="summary-copy">Saved cleanup and tool activity recorded for the current day.</span>
            </div>
        </div>
    </article>

    <div class="dashboard-grid dashboard-metrics-grid">
        <article class="stat-card dashboard-metric-card">
            <div class="dashboard-metric-topline">
                <span class="dashboard-metric-kicker">Today</span>
                <div class="dashboard-metric-icon blue">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                </div>
            </div>
            <div class="dashboard-metric-value">{blocksToday}</div>
            <h3>Saved Activity Today</h3>
            <p class="dashboard-metric-copy">Saved cleanup and tool actions recorded during today's browsing.</p>
        </article>

        <article class="stat-card dashboard-metric-card">
            <div class="dashboard-metric-topline">
                <span class="dashboard-metric-kicker">Privacy</span>
                <div class="dashboard-metric-icon purple">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="22" y1="12" x2="18" y2="12"></line>
                        <line x1="6" y1="12" x2="2" y2="12"></line>
                        <line x1="12" y1="6" x2="12" y2="2"></line>
                        <line x1="12" y1="22" x2="12" y2="18"></line>
                    </svg>
                </div>
            </div>
            <div class="dashboard-metric-value">{totalTrackers}</div>
            <h3>Custom Network Rules</h3>
            <p class="dashboard-metric-copy">Enabled custom tracker or domain rules currently configured in this browser.</p>
        </article>

        <article class="stat-card dashboard-metric-card">
            <div class="dashboard-metric-topline">
                <span class="dashboard-metric-kicker">Ads</span>
                <div class="dashboard-metric-icon red">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                        <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>
                </div>
            </div>
            <div class="dashboard-metric-value">{totalAds}</div>
            <h3>Enabled Core Rules</h3>
            <p class="dashboard-metric-copy">Built-in core protection rules currently enabled in the browser profile.</p>
        </article>
    </div>

    <div class="dashboard-lower-grid">
        <article class="stat-card dashboard-summary-card">
            <div class="dashboard-summary-header">
                <div>
                    <h3>How To Read These Numbers</h3>
                    <p class="setting-description">Real counts from saved extension activity, shown without fake scoring.</p>
                </div>
                <span class="gauge-badge">Live Data</span>
            </div>

            <div class="dashboard-summary-grid">
                <div class="summary-pill">
                    <span class="summary-label">Profile Status</span>
                    <strong>{profileStatus}</strong>
                    <span class="summary-copy">{totalInterventions} saved-activity and enabled-rule signals are contributing to this snapshot.</span>
                </div>
                <div class="summary-pill">
                    <span class="summary-label">Today</span>
                    <strong>{blocksToday}</strong>
                    <span class="summary-copy">This number reflects saved activity in the current day only.</span>
                </div>
                <div class="summary-pill">
                    <span class="summary-label">Privacy</span>
                    <strong>{totalTrackers}</strong>
                    <span class="summary-copy">Enabled custom network rules you currently have configured.</span>
                </div>
                <div class="summary-pill">
                    <span class="summary-label">Ads</span>
                    <strong>{totalAds}</strong>
                    <span class="summary-copy">Built-in core rules currently enabled in this browser profile.</span>
                </div>
            </div>
        </article>

        <article class="stat-card dashboard-guidance-card">
            <span class="dashboard-metric-kicker">Workflow</span>
            <h3>Use Smaller Changes Before Global Ones</h3>
            <p class="dashboard-guidance-copy">ZenithGuard works best when we change the narrowest thing that solves the problem.</p>
            <div class="dashboard-guidance-list">
                <div class="guidance-item">
                    <strong>1. Check the logger first</strong>
                    <span>Use the popup or logger to see whether the issue is ads, trackers, or a site-specific rule.</span>
                </div>
                <div class="guidance-item">
                    <strong>2. Prefer site-level changes</strong>
                    <span>Use My Rules, Zapper, Inspector, or Isolation Mode before broad global changes.</span>
                </div>
                <div class="guidance-item">
                    <strong>3. Pause only as a last resort</strong>
                    <span>Turn protection off for a site only when the page genuinely cannot work any other way.</span>
                </div>
            </div>
        </article>
    </div>

    <article class="stat-card extension-health-card">
        <div class="dashboard-summary-header">
            <div>
                <h3>Extension Health</h3>
                <p class="setting-description">Live runtime checks for rulesets, storage initialization, and current protection state.</p>
            </div>
            <div class="health-header-actions">
                <span class:attention={health.status === "attention"} class="gauge-badge">{health.statusLabel}</span>
                <button type="button" class="btn btn-secondary health-copy-button" disabled={healthRefreshBusy} on:click={onRefreshHealth}>
                    {healthRefreshBusy ? "Refreshing..." : "Refresh Health"}
                </button>
                <button type="button" class="btn btn-secondary health-copy-button" disabled={!canOpenDiagnosticsLogger || diagnosticsAnalyzerBusy} on:click={onOpenDiagnosticsAnalyzer}>
                    {diagnosticsAnalyzerBusy ? "Opening..." : "Open Analyzer"}
                </button>
                <button type="button" class="btn btn-secondary health-copy-button" disabled={!canOpenDiagnosticsLogger || diagnosticsLoggerBusy} on:click={onOpenDiagnosticsLogger}>
                    {diagnosticsLoggerBusy ? "Opening..." : "Open Logger"}
                </button>
                <button type="button" class="btn btn-secondary health-copy-button" disabled={diagnosticsCopyBusy} on:click={onCopyDiagnostics}>
                    {diagnosticsCopyBusy ? "Copying..." : "Copy Diagnostics"}
                </button>
                <button type="button" class="btn btn-secondary health-copy-button" disabled={diagnosticsDownloadBusy} on:click={onDownloadDiagnostics}>
                    {diagnosticsDownloadBusy ? "Downloading..." : "Download Diagnostics"}
                </button>
            </div>
        </div>

        {#if diagnosticsStatusMessage}
            <p role="status" aria-live="polite" class="health-copy-status">{diagnosticsStatusMessage}</p>
        {/if}

        <div class="health-status-strip">
            <div class="summary-pill">
                <span class="summary-label">Static Core</span>
                <strong>{health.staticCoreEnabled ? "Enabled" : "Disabled"}</strong>
                <span class="summary-copy">Ruleset: core_protection</span>
            </div>
            <div class="summary-pill">
                <span class="summary-label">YouTube Rules</span>
                <strong>{health.youtubeRulesEnabled ? "Enabled" : health.youtubeRulesExpected ? "Disabled" : "Off by Setting"}</strong>
                <span class="summary-copy">Ruleset: youtube_core</span>
            </div>
            <div class="summary-pill">
                <span class="summary-label">Dynamic Rules</span>
                <strong>{health.dynamicRuleCount}</strong>
                <span class="summary-copy">Current DNR dynamic rule count.</span>
            </div>
            <div class="summary-pill">
                <span class="summary-label">Storage</span>
                <strong>{health.settingsInitialized ? "Initialized" : "Missing"}</strong>
                <span class="summary-copy">{health.defaultOverrideCount} built-in override{health.defaultOverrideCount === 1 ? "" : "s"} stored.</span>
            </div>
        </div>

        <div class="health-detail-grid">
            <div class="health-detail-row">
                <span>Global Protection</span>
                <strong>{health.protectionEnabled ? "On" : "Off"}</strong>
            </div>
            <div class="health-detail-row">
                <span>Pause State</span>
                <strong>{pauseLabel}</strong>
            </div>
            <div class="health-detail-row">
                <span>Session Allowlist</span>
                <strong>{health.sessionAllowlistCount}</strong>
            </div>
            <div class="health-detail-row">
                <span>Paused Sites</span>
                <strong>{health.disabledSiteCount}</strong>
            </div>
            <div class="health-detail-row">
                <span>Enabled Rulesets</span>
                <strong>{enabledRulesetLabel}</strong>
            </div>
            <div class="health-detail-row">
                <span>Extension Build</span>
                <strong>{health.manifestVersion}</strong>
            </div>
            <div class="health-detail-row">
                <span>Diagnostics Site</span>
                <strong title={diagnosticsSiteTitle}>{diagnosticsSiteLabel}</strong>
            </div>
            <div class="health-detail-row">
                <span>Network Decisions</span>
                <strong title={diagnosticsNetworkTitle}>{diagnosticsNetworkLabel}</strong>
            </div>
        </div>

        <div class="health-diagnostics-preview" aria-label="Diagnostics preview">
            <div class="health-preview-header">
                <div>
                    <span class="dashboard-metric-kicker">Diagnostics Preview</span>
                    <h4>What Gets Shared</h4>
                </div>
                <span>Private URL parts stay out.</span>
            </div>
            <div class="health-preview-grid">
                {#each diagnosticsPreview as item}
                    <div class="health-preview-row">
                        <span>{item.label}</span>
                        <strong title={item.detail || item.value}>{item.value}</strong>
                        {#if item.detail}
                            <small>{item.detail}</small>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        {#if health.issues.length > 0}
            {#if !health.protectionEnabled}
                <div class="health-repair-row">
                    <div>
                        <strong>Global protection is off</strong>
                        <span>Re-enable ZenithGuard's browser-wide blocking and protection engine.</span>
                    </div>
                    <button type="button" class="btn btn-primary health-repair-button" disabled={healthRepairBusy} on:click={onReEnableProtection}>
                        {healthRepairBusy ? "Re-enabling..." : "Re-enable Protection"}
                    </button>
                </div>
            {/if}
            {#if isProtectionPaused}
                <div class="health-repair-row">
                    <div>
                        <strong>Protection is paused</strong>
                        <span>Resume ZenithGuard's browser-wide blocking and protection engine now.</span>
                    </div>
                    <button type="button" class="btn btn-primary health-repair-button" disabled={healthRepairBusy} on:click={onResumeProtection}>
                        {healthRepairBusy ? "Resuming..." : "Resume Protection"}
                    </button>
                </div>
            {/if}
            <div class="health-issue-list">
                {#each health.issues as issue}
                    <span>{issue}</span>
                {/each}
            </div>
        {:else}
            <p class="health-ok-copy">Rulesets are enabled, settings are initialized, and protection is active.</p>
        {/if}

        {#if healthRepairStatusMessage}
            <p role="status" aria-live="polite" class="health-copy-status">{healthRepairStatusMessage}</p>
        {/if}
    </article>
</section>
