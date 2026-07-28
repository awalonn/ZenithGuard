<script lang="ts">
    export let title = "";
    export let tone = "";
    export let count = 0;
    export let items: string[] = [];
    export let emptyMessage = "";
    export let variant: "visual" | "accent" = "visual";
</script>

<div class="report-card">
    <div class={"card-title " + tone}>
        <div class="card-title-main">
            <span>{title}</span>
            <span class="category-count">{count}</span>
        </div>
    </div>
    {#if items.length > 0}
        <div class="report-list" id={variant === "visual" ? "visual-suggestions-content" : undefined}>
            {#each items as item}
                {#if variant === "accent"}
                    <div class="threat-entry threat-entry-accent"><span class="threat-url threat-url-accent">{item}</span></div>
                {:else}
                    <div class="suggestion-card"><div class="suggestion-description">{item}</div></div>
                {/if}
            {/each}
        </div>
    {:else}
        <p class="no-results-message">{emptyMessage}</p>
    {/if}
</div>
