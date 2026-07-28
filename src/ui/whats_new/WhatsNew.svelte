<script lang="ts">
    import { onMount } from "svelte";
    import { closeCurrentTabOrWindow } from "../../js/shared/browser";

    let version = "v3.3.0";

    const changes = [
        {
            label: "Privacy",
            title: "Sensitive settings stay on this device",
            copy: "Gemini API keys now use local extension storage instead of Chrome Sync, backups exclude the key, and the extension includes a clear privacy policy.",
        },
        {
            label: "Permissions",
            title: "Browsing-data access is now optional",
            copy: "Forgetful Browsing requests its extra permission only when you enable the feature, keeping the default installation footprint smaller.",
        },
        {
            label: "Security",
            title: "A tighter extension surface",
            copy: "Unused externally accessible bundles and dormant policy-scanning code were removed, while dynamic interface content is now rendered through safer DOM APIs.",
        },
        {
            label: "Reliability",
            title: "Dependencies and threat data refreshed",
            copy: "Core tooling was updated, the malware-domain feed is pinned and validated before caching, and packaged Chrome workflows now run reliably on current Puppeteer.",
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
                <p class="intro">This release focuses on privacy, least-privilege permissions, and a smaller, safer extension surface.</p>
                <span id="version-badge" class="version-badge">{version}</span>
            </div>
        </header>

        <section class="summary-strip">
            <div class="summary-card">
                <span class="summary-label">Focus</span>
                <strong>Privacy + security</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Work</span>
                <strong>Permissions, storage, dependencies</strong>
            </div>
            <div class="summary-card">
                <span class="summary-label">Outcome</span>
                <strong>Safer defaults and packaging</strong>
            </div>
        </section>

        <section class="changelog">
            <h2>{version} - The Privacy and Hardening Release</h2>
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
