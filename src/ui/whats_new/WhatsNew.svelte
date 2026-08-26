<script lang="ts">
    import { onMount } from "svelte";
    import { closeCurrentTabOrWindow } from "../../js/shared/browser";

    let version = "v3.3.1";

    const changes = [
        {
            label: "Startup",
            title: "One initialization per Chrome launch",
            copy: "The background worker no longer rebuilds extension state whenever it wakes, eliminating duplicate rule work during profile startup.",
        },
        {
            label: "Rules",
            title: "Unchanged rules stay untouched",
            copy: "ZenithGuard compares generated dynamic rules with Chrome's installed rules and skips the expensive remove-and-readd cycle when nothing changed.",
        },
        {
            label: "Pages",
            title: "Heavy cleanup runs once per tab",
            copy: "The full content runtime now stays in the top frame instead of starting another copy inside every iframe on restored pages.",
        },
        {
            label: "Performance",
            title: "DOM monitoring is more selective",
            copy: "Broad class and ID observation was removed, native CSS handles late ad markers, and built-in cleanup performs fewer repeated whole-page scans.",
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
                <p class="intro">This patch reduces Chrome profile-launch work, especially when restoring many tabs and embedded frames.</p>
                <span id="version-badge" class="version-badge">{version}</span>
            </div>
        </header>

        <section class="summary-strip">
            <div class="summary-card">
                <span class="summary-label">Focus</span>
                <strong>Startup performance</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Work</span>
                <strong>Rules, frames, DOM observers</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Outcome</span>
                <strong>Less work during profile launch</strong>
            </div>
        </section>

        <section class="changelog">
            <h2>{version} - The Startup Performance Release</h2>
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
