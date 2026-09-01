<script lang="ts">
    import { onMount } from "svelte";
    import { closeCurrentTabOrWindow } from "../../js/shared/browser";

    let version = "v3.3.2";

    const changes = [
        {
            label: "Compatibility",
            title: "Google sign-in works without pausing protection",
            copy: "User-triggered Google OAuth windows and Google Identity button frames are allowed while unsolicited popups and advertising domains remain protected.",
        },
        {
            label: "Gemini",
            title: "Current Gemini models",
            copy: "The model menu now includes Gemini 3.7 Flash, 3.6 Flash, 3.5 Flash-Lite, and 3.1 Pro Preview with a shared runtime-safe configuration.",
        },
        {
            label: "Migration",
            title: "Obsolete AI presets recover automatically",
            copy: "Removed presets fall back to the current default, and ZenithGuard omits sampling parameters no longer accepted by Gemini 3.x.",
        },
        {
            label: "Settings",
            title: "Cleaner rule forms",
            copy: "Rule fields and action buttons now keep consistent spacing and wrap safely on narrower Settings windows.",
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
                <p class="intro">This patch restores Google sign-in compatibility, refreshes Gemini support, and polishes rule management.</p>
                <span id="version-badge" class="version-badge">{version}</span>
            </div>
        </header>

        <section class="summary-strip">
            <div class="summary-card">
                <span class="summary-label">Focus</span>
                <strong>Login compatibility</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Work</span>
                <strong>OAuth, Gemini, Settings UI</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Outcome</span>
                <strong>Sign in without pausing protection</strong>
            </div>
        </section>

        <section class="changelog">
            <h2>{version} - Compatibility &amp; AI Update</h2>
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
