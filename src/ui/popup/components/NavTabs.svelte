<script lang="ts">
    import type { PopupTab } from "../types";

    export let activeTab: PopupTab = "home";
    export let onChange: (tab: PopupTab) => void = () => {};
</script>

<nav class="nav-tabs glass-card">
    <button class="tab-btn" class:active={activeTab === "home"} on:click={() => onChange("home")}>Home</button>
    <button class="tab-btn" class:active={activeTab === "insights"} on:click={() => onChange("insights")}>Insights</button>
    <button class="tab-btn" class:active={activeTab === "tools"} on:click={() => onChange("tools")}>Tools</button>
</nav>
