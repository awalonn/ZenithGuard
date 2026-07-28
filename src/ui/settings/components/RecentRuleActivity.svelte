<script lang="ts">
    import type { RuleActivityEntry } from "../types";

    export let activity: RuleActivityEntry[] = [];
    export let formatRuleTimestamp: (timestamp: number) => string;
    export let onSelect: (entry: RuleActivityEntry) => void;
</script>

<div class="rules-summary-strip">
    {#if activity.length > 0}
        {#each activity as entry}
            <button type="button" class="rules-summary-chip rules-summary-chip-activity rules-summary-chip-action" on:click={() => onSelect(entry)}>
                <span class="rules-summary-label">{entry.category === "network" ? "Custom Block" : "Custom Hiding"}</span>
                <strong>{entry.label}</strong>
                <span class="rules-summary-detail">{entry.detail} · {formatRuleTimestamp(entry.timestamp)}</span>
            </button>
        {/each}
    {:else}
        <div class="rules-summary-chip rules-summary-chip-activity">
            <span class="rules-summary-label">No recent activity</span>
            <strong>Nothing timestamped yet</strong>
            <span class="rules-summary-detail">Add a custom network block or let self-heal touch a hiding rule to populate this strip.</span>
        </div>
    {/if}
</div>
