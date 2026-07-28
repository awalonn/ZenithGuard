<script lang="ts">
    import type { RulesSummaryChip } from "../types";

    export let chips: RulesSummaryChip[] = [];
</script>

<div class="rules-summary-strip">
    {#each chips as chip}
        <div class="rules-summary-chip">
            <span class="rules-summary-label">{chip.label}</span>
            <strong>{chip.value}</strong>
            {#if chip.detail}
                <span class="rules-summary-detail">{chip.detail}</span>
            {/if}
        </div>
    {/each}
</div>
