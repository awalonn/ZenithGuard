<script lang="ts">
    import type {
        CoreSettingDefinition,
        GeminiModelPreset,
        LocalAiBlockActionState,
        LocalAiClassificationResult,
        MalwareFeedStatus,
        SettingsSnapshot,
    } from "../types";
    import type { SettingsImportPreview } from "../settings_controller";

    export let settings: SettingsSnapshot;
    export let malwareFeed: MalwareFeedStatus;
    export let coreProtectionSettings: CoreSettingDefinition[] = [];
    export let geminiModelPresets: GeminiModelPreset[] = [];
    export let isLocalAiTestAvailable = false;
    export let apiKey = "";
    export let geminiModel = "";
    export let geminiModelOverride = "";
    export let localAiText = "";
    export let localAiLoading = false;
    export let localAiResult: LocalAiClassificationResult | null = null;
    export let localAiBlockAction: LocalAiBlockActionState;

    export let onToggleSetting: (settingId: keyof SettingsSnapshot) => Promise<void> | void = () => {};
    export let onSaveApiKey: () => Promise<void> | void = () => {};
    export let onSaveGeminiModel: () => Promise<void> | void = () => {};
    export let onSaveGeminiModelOverride: () => Promise<void> | void = () => {};
    export let onRunLocalAi: () => Promise<void> | void = () => {};
    export let onAddLocalAiToBlocklist: () => Promise<void> | void = () => {};
    export let onExportSettings: () => Promise<void> | void = () => {};
    export let onImportSettings: () => Promise<void> | void = () => {};
    export let onConfirmImportSettings: () => Promise<void> | void = () => {};
    export let onCancelImportSettings: () => Promise<void> | void = () => {};
    export let pendingImportPreview: SettingsImportPreview | null = null;
    export let backupStatusMessage = "";
    export let backupBusy = false;

    function formatMalwareDate(timestamp: number | null): string {
        return timestamp ? new Date(timestamp).toLocaleString() : "No cached refresh yet";
    }
</script>

<section class="content-section active">
    <div class="content-header page-header">
        <div>
            <span class="page-kicker">Core Controls</span>
            <h1>General Settings</h1>
            <p class="page-subtitle">Tune default protection, optional AI features, and backup/export controls without touching site-specific rules.</p>
        </div>
        <span class="section-tag neutral">Global</span>
    </div>

    <div class="info-box">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="M9 12l2 2 4-4"></path>
        </svg>
        <p><strong>Recommended default.</strong> Leave the core protection toggles on unless a site is breaking. If something feels too aggressive, adjust a single feature first so it is easier to see what changed.</p>
    </div>

    <div class="setting-item full-span global-protection-card">
        <div class="setting-row">
            <div>
                <span id="setting-label-global-protection" class="setting-title">Global Protection</span>
                <p id="setting-description-global-protection" class="setting-description">Master switch for ZenithGuard's browser-wide blocking and protection engine. Turn this off only when you want ZenithGuard to stand down everywhere.</p>
            </div>
            <div class="global-protection-control">
                <span class={settings.isProtectionEnabled ? "section-tag recommended" : "section-tag caution"}>
                    {settings.isProtectionEnabled ? "On" : "Off"}
                </span>
                <label class="switch">
                    <input
                        id="setting-toggle-global-protection"
                        type="checkbox"
                        checked={settings.isProtectionEnabled}
                        aria-labelledby="setting-label-global-protection"
                        aria-describedby="setting-description-global-protection"
                        on:change={() => onToggleSetting("isProtectionEnabled")}
                    />
                    <span class="slider" aria-hidden="true"></span>
                </label>
            </div>
        </div>
    </div>

    <div class="settings-overview-strip">
        <div class="summary-pill">
            <span class="summary-label">Protection Profile</span>
            <strong>{settings.isProtectionEnabled ? (settings.isPerformanceModeEnabled ? "Lightweight" : "Standard") : "Disabled"}</strong>
            <span class="summary-copy">Overall default posture for blocking and privacy protections.</span>
        </div>
        <div class="summary-pill">
            <span class="summary-label">Performance Mode</span>
            <strong>{settings.isPerformanceModeEnabled ? "On" : "Off"}</strong>
            <span class="summary-copy">Lower-intensity mode for lighter cleanup and faster browsing.</span>
        </div>
        <div class="summary-pill">
            <span class="summary-label">Gemini Model</span>
            <strong>{geminiModelOverride || geminiModel || "Not set"}</strong>
            <span class="summary-copy">Active AI model for optional Gemini-assisted tools.</span>
        </div>
        <div class="summary-pill">
            <span class="summary-label">Malware Cache</span>
            <strong>{malwareFeed.cachedDomains}</strong>
            <span class="summary-copy">Domains currently available from the malware security feed.</span>
        </div>
    </div>

    <div class="section-heading">
        <div>
            <h3>Core Protection</h3>
            <p class="section-subtitle">These controls affect ZenithGuard's default blocking, sanitizing, and privacy behavior across the browser.</p>
        </div>
        <span class="section-tag recommended">Recommended On</span>
    </div>

    <div class="settings-grid">
        {#each coreProtectionSettings as setting}
            <div class="setting-item">
                <div class="setting-row">
                    <span id={"setting-label-" + setting.id} class="setting-title">{setting.name}</span>
                    <label class="switch">
                        <input
                            id={"setting-toggle-" + setting.id}
                            type="checkbox"
                            checked={settings[setting.id]}
                            aria-labelledby={"setting-label-" + setting.id}
                            aria-describedby={"setting-description-" + setting.id}
                            on:change={() => onToggleSetting(setting.id)}
                        />
                        <span class="slider" aria-hidden="true"></span>
                    </label>
                </div>
                <p id={"setting-description-" + setting.id} class="setting-description">{setting.desc}</p>
            </div>
        {/each}
    </div>

    <div class="setting-item full-span protection-source-card top-gap-small">
        <div class="setting-row">
            <span class="setting-title">Malware Feed Status</span>
            <span class="section-tag neutral">Remote + Bundled</span>
        </div>
        <p class="setting-description">Malware protection is the one remaining external security-feed path in ZenithGuard. It combines a bundled seed list with a refreshed remote malware hosts feed.</p>
        <div class="protection-source-grid">
            <div class="summary-pill"><span class="summary-label">Remote Source</span><strong>{malwareFeed.remoteSourceLabel}</strong></div>
            <div class="summary-pill"><span class="summary-label">Bundled Seed</span><strong>{malwareFeed.bundledSeedPath}</strong></div>
            <div class="summary-pill"><span class="summary-label">Cached Domains</span><strong>{malwareFeed.cachedDomains}</strong></div>
            <div class="summary-pill"><span class="summary-label">Last Refresh</span><strong>{formatMalwareDate(malwareFeed.lastUpdated)}</strong></div>
        </div>
    </div>

    <div class="section-heading top-gap">
        <div>
            <h3>Performance</h3>
            <p class="section-subtitle">Use this only when you want a lighter touch and can accept less aggressive cleanup.</p>
        </div>
        <span class="section-tag caution">Tradeoff</span>
    </div>

    <div class="settings-grid settings-grid-single">
        <div class="setting-item">
            <div class="setting-row">
                <span id="setting-label-performance-mode" class="setting-title">Performance Mode</span>
                <label class="switch">
                    <input
                        id="setting-toggle-performance-mode"
                        type="checkbox"
                        checked={settings.isPerformanceModeEnabled}
                        aria-labelledby="setting-label-performance-mode"
                        aria-describedby="setting-description-performance-mode"
                        on:change={() => onToggleSetting("isPerformanceModeEnabled")}
                    />
                    <span class="slider" aria-hidden="true"></span>
                </label>
            </div>
            <p id="setting-description-performance-mode" class="setting-description">Prioritizes speed over non-critical visual filtering.</p>
        </div>
    </div>

    <div class="section-heading top-gap">
        <div>
            <h3>AI Features (Gemini)</h3>
            <p class="section-subtitle">These features use your Gemini key for AI-assisted actions like self-healing and smart cookie handling.</p>
            <p class="section-subtitle">Choose which Gemini model ZenithGuard should use for AI-assisted tools.</p>
        </div>
        <span class="section-tag neutral">Optional</span>
    </div>

    <div class="settings-grid">
        <div class="setting-item full-span">
            <label for="gemini-api-key-input">Google Gemini API Key</label>
            <p id="gemini-api-key-help" class="setting-description">Required for AI Self-Healing, Analytics, and Cookie AI. ZenithGuard stores this key locally on this device and excludes it from settings backups. When you actively run a Gemini feature, the extension sends the data needed for that action—such as a page screenshot, URL, page text, selector context, or request URLs—to Google Gemini.</p>
            <p class="setting-description"><a href="https://github.com/awalonn/ZenithGuard/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">Read the ZenithGuard Privacy Policy</a>.</p>
            <form class="api-key-form" on:submit|preventDefault={onSaveApiKey}>
                <input id="gemini-api-key-input" type="password" bind:value={apiKey} placeholder="Enter your Gemini API key" aria-describedby="gemini-api-key-help" />
                <button type="submit" class="btn btn-primary">Save</button>
            </form>
            <div class="api-key-form top-gap-small">
                <select bind:value={geminiModel} aria-label="Gemini model">
                    {#each geminiModelPresets as preset}
                        <option value={preset.value}>{preset.label}</option>
                    {/each}
                </select>
                <button type="button" class="btn btn-secondary" on:click={onSaveGeminiModel}>Save Model</button>
            </div>
            <p class="setting-description">If AI Studio exposes a model id before ZenithGuard ships it as a preset, paste it below and ZenithGuard will use it directly.</p>
            <div class="api-key-form top-gap-small">
                <input type="text" bind:value={geminiModelOverride} placeholder="Optional custom model id (for example: gemini-3.1-flash-lite-preview)" aria-label="Custom Gemini model id" />
                <button type="button" class="btn btn-secondary" on:click={onSaveGeminiModelOverride}>Save Custom ID</button>
            </div>
        </div>
    </div>

    <div class="section-heading top-gap">
        <div>
            <h3>Local AI Integration (Beta)</h3>
            <p class="section-subtitle">Runs inside the browser and does not depend on your Gemini key.</p>
        </div>
        <span class="section-tag beta">Beta</span>
    </div>

    <div class="settings-grid">
        <div class="setting-item full-span local-ai-card">
            <label for="local-ai-test-input">Zero-Shot Text Classification (Transformers.js)</label>
            <p class="setting-description">Test the local heuristic classifier. This packaged JavaScript runs entirely in your browser without contacting Google Gemini. Paste a request URL, domain, or short log line rather than generic page copy.</p>
            <p class="setting-description table-note table-note-top">Good examples: `url: https://connect.facebook.net/en_US/fbevents.js`, `domain: hotjar.com`, `https://www.google-analytics.com/g/collect?v=2`.</p>
            {#if !isLocalAiTestAvailable}
                <p class="setting-note caution">Enable Next-Gen AI Eradicator and disable Performance Mode to run this local AI test.</p>
            {/if}
            <textarea class="settings-textarea" id="local-ai-test-input" rows="3" bind:value={localAiText}></textarea>
            <div class="local-ai-actions">
                <button type="button" class="btn btn-primary" on:click={onRunLocalAi} disabled={localAiLoading}>
                    {localAiLoading ? "Running..." : "Test Local AI"}
                </button>
                {#if localAiBlockAction.isEligible}
                    <div class="local-ai-followup">
                        <span class="local-ai-domain-chip">{localAiBlockAction.candidateDomain}</span>
                        <button type="button" class="btn btn-secondary" disabled={localAiBlockAction.isLoading} on:click={onAddLocalAiToBlocklist}>
                            {localAiBlockAction.isLoading ? "Adding..." : "Add Domain to Blocklist"}
                        </button>
                    </div>
                {/if}
                {#if localAiResult}
                    <div role="status" aria-live="polite">
                        {#if "error" in localAiResult}
                            <strong>Result:</strong> <span>{localAiResult.error}</span>
                        {:else if typeof localAiResult.confidence === "number"}
                            <strong>Result:</strong> <span>{localAiResult.isAdRelated ? "Ad/Tracker" : "Normal Content"}</span> <span class="local-ai-confidence">({Math.round(localAiResult.confidence * 100)}%)</span>
                        {:else}
                            <strong>Result:</strong> <span>{localAiResult.isAdRelated ? "Ad/Tracker" : "Normal Content"}</span>
                        {/if}
                    </div>
                {/if}
                {#if localAiBlockAction.message}
                    <p role="status" aria-live="polite">{localAiBlockAction.message}</p>
                {/if}
            </div>
        </div>
    </div>

    <div class="section-heading top-gap">
        <div>
            <h3>Data Management</h3>
            <p class="section-subtitle">Export your current setup before making large changes or moving to another browser profile.</p>
        </div>
    </div>

    <div class="setting-item full-span data-management-card">
        <p class="setting-description">Export gives you a portable backup of your current rules and settings. Import restores a previously exported ZenithGuard backup into this browser profile.</p>
        <div class="data-actions">
            <button type="button" class="btn btn-secondary" disabled={backupBusy} on:click={onExportSettings}>Export Settings</button>
            <button type="button" class="btn btn-secondary" disabled={backupBusy} on:click={onImportSettings}>Import Settings</button>
        </div>
        {#if backupStatusMessage}
            <p role="status" aria-live="polite" class="setting-description top-gap-small">{backupStatusMessage}</p>
        {/if}
        {#if pendingImportPreview}
            <div class="import-preview" role="region" aria-label="Import preview">
                <ul>
                    {#each pendingImportPreview.items as item}
                        <li>{item}</li>
                    {/each}
                </ul>
                <div class="data-actions">
                    <button type="button" class="btn btn-primary" disabled={backupBusy} on:click={onConfirmImportSettings}>Confirm Import</button>
                    <button type="button" class="btn btn-secondary" disabled={backupBusy} on:click={onCancelImportSettings}>Cancel</button>
                </div>
            </div>
        {/if}
    </div>
</section>
