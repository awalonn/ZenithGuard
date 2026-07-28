<script lang="ts">
    import { onMount } from "svelte";
    import { closeCurrentTabOrWindow } from "../../js/shared/browser";

    let version = "v3.2.2";

    const changes = [
        {
            label: "Architecture",
            title: "Old ruleset baggage cleared out",
            copy: "Legacy EasyList-era scripts, stale ruleset files, and misleading updater paths were removed so the codebase now reflects the blocker architecture we actually ship.",
        },
        {
            label: "Tools",
            title: "Manual reports are easier to act on",
            copy: "Popup site reports now include review candidates, Logger Review shortcuts, and a redacted Copy Review List path for sharing likely ad-tech misses without exposing private request paths.",
        },
        {
            label: "AI",
            title: "Gemini controls are clearer",
            copy: "The default Gemini model was refreshed, error states are easier to understand, and you can now override the model ID in Settings when you want to test a different Gemini variant.",
        },
        {
            label: "Core",
            title: "Safer packaged rules",
            copy: "The built-in core rules layer now has stronger smoke guards against broad payment and TikTok-family compatibility filters while preserving narrow telemetry coverage.",
        },
    ];

    onMount(() => {
        const queryVersion = new URLSearchParams(window.location.search).get("v");
        if (queryVersion) {
            version = `v${queryVersion}`;
            return;
        }

        try {
            version = `v${chrome.runtime.getManifest().version}`;
        } catch (error) {
            console.warn("Could not get extension version", error);
        }
    });

    async function closePage(): Promise<void> {
        await closeCurrentTabOrWindow();
    }
</script>

<div class="page-wrapper zg-whats-new-shell">
    <div class="container glass-panel">
        <header class="header">
            <img src="/icons/icon48.png" alt="ZenithGuard Logo" />
            <div class="header-text">
                <div class="eyebrow">Release Notes</div>
                <h1>What&apos;s New in ZenithGuard</h1>
                <p class="intro">This release keeps the momentum on clarity: cleaner architecture, sharper tools, and a safer packaged core so the extension feels easier to trust and easier to operate.</p>
                <span id="version-badge" class="version-badge">{version}</span>
            </div>
        </header>

        <section class="summary-strip">
            <div class="summary-card">
                <span class="summary-label">Focus</span>
                <strong>Tools + clarity</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Work</span>
                <strong>Architecture, tools, core rules</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Outcome</span>
                <strong>Cleaner, safer extension surface</strong>
            </div>
        </section>

        <section class="changelog">
            <h2>{version} - The Reporting and Compatibility Release</h2>
            {#each changes as change}
                <div class="change-item">
                    <div class="change-meta">
                        <span class="change-label">{change.label}</span>
                    </div>
                    <div class="change-content">
                        <h3>{change.title}</h3>
                        <p>{change.copy}</p>
                    </div>
                </div>
            {/each}
        </section>

        <footer class="footer">
            <button id="close-btn" class="btn-primary" on:click={closePage}>Continue</button>
        </footer>
    </div>
</div>
