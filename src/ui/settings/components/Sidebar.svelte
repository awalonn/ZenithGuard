<script lang="ts">
    import type { NavigationItem, SettingsSectionId } from "../types";

    export let items: NavigationItem[] = [];
    export let activeSection: SettingsSectionId = "dashboard";
    export let isDarkMode = true;
    export let onSectionChange: (section: SettingsSectionId) => void = () => {};
    export let onToggleTheme: () => void = () => {};
</script>

<aside class="sidebar">
    <div class="sidebar-header">
        <img src="/icons/icon48.png" alt="ZenithGuard Logo" />
        <div class="sidebar-brand-copy">
            <span class="sidebar-kicker">Control Center</span>
            <h1>ZenithGuard</h1>
            <p>Protection controls and site policy</p>
        </div>
    </div>

    <nav class="sidebar-nav" aria-label="Settings sections">
        {#each items as item}
            <button
                class:active={activeSection === item.id}
                class="nav-btn"
                type="button"
                on:click={() => onSectionChange(item.id)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d={item.path}></path>
                </svg>
                <span>{item.label}</span>
            </button>
        {/each}
    </nav>

    <div class="sidebar-footer">
        <div class="sidebar-footer-copy">
            <span class="sidebar-footer-label">Appearance</span>
            <p>Switch the settings surface between ZenithGuard's dark and light themes.</p>
        </div>
        <div class="theme-switch-label">
            <span>{isDarkMode ? "Dark Mode" : "Light Mode"}</span>
            <label class="switch">
                <input
                    id="theme-mode-toggle"
                    type="checkbox"
                    checked={!isDarkMode}
                    aria-label={`Use ${isDarkMode ? "light" : "dark"} theme`}
                    on:change={onToggleTheme}
                />
                <span class="slider" aria-hidden="true"></span>
            </label>
        </div>
    </div>
</aside>
