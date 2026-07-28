<script lang="ts">
    import type { ToolStatusCard } from "../types";

    export let card: ToolStatusCard;
    export let onAction: (() => void | Promise<void>) | null = null;
</script>

<article class={"glass-card tool-feedback-card " + card.tone}>
    <div class="status-topline">
        <span class={"tone-pill " + card.tone}>{card.tone}</span>
    </div>
    <h3>{card.title}</h3>
    <p>{card.message}</p>
    {#if card.actionLabel && onAction}
        <button class="secondary-btn" on:click={onAction}>{card.actionLabel}</button>
    {/if}
</article>
