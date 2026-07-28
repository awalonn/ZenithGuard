<script lang="ts">
    import { getHeroToggleChecked, getHeroToggleLabel, getProtectionLabel, getSitePolicySummary } from "../state";
    import type { SitePolicyState } from "../types";

    export let hostname = "";
    export let policy: SitePolicyState;
    export let onOpenSettings: () => void | Promise<void> = () => {};
    export let onToggleProtection: () => void | Promise<void> = () => {};
</script>

<header class="hero-section glass-card">
    <div class="top-bar">
        <div class="hero-brand">
            <div class="eyebrow">Active Site</div>
            <div class="brand-name">ZenithGuard</div>
            <div class="site-status">{hostname}</div>
        </div>
        <button class="secondary-btn settings-btn" on:click={onOpenSettings}>Settings</button>
    </div>

    <div class="hero-main">
        <div class="hero-copy">
            <h1>{getProtectionLabel(policy)}</h1>
            <p>{getSitePolicySummary(policy)}</p>
        </div>

        <label class="toggle-row">
            <span class="toggle-label">{getHeroToggleLabel(policy)}</span>
            <input
                type="checkbox"
                checked={getHeroToggleChecked(policy)}
                on:change={onToggleProtection}
            />
        </label>
    </div>
</header>
