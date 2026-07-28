<script lang="ts">
    import type { IndexedToggleableRuleEntry } from "../types";

    export let totalCount = 0;
    export let enabledCount = 0;
    export let search = "";
    export let rules: IndexedToggleableRuleEntry[] = [];
    export let onToggle: (index: number, enabled: boolean) => void | Promise<void>;
    export let onBulkEnable: () => void | Promise<void>;
    export let onBulkDisable: () => void | Promise<void>;
    export let onReset: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Built-in Core Rules <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">ZenithGuard's packaged high-confidence baseline. Turn individual built-in protections on or off here without editing your custom rules.</p>
        </div>
    </div>
    <p class="setting-description table-note">These are core shipped protections, applied through ZenithGuard's packaged core rules layer.</p>
    <div class="table-note table-note-top table-note-actions">
        <p class="setting-description">{enabledCount} packaged core rules are currently enabled.</p>
        <button type="button" class="btn btn-secondary btn-small" on:click={onReset}>Restore Recommended Defaults</button>
    </div>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search built-in core rules" bind:value={search} />
        <div class="rules-table-actions">
            {#if search}
                <button type="button" class="btn btn-secondary btn-small" on:click={onClearSearch}>Clear Filter</button>
            {/if}
            <button type="button" class="btn btn-secondary btn-small" on:click={onBulkEnable}>Enable Visible</button>
            <button type="button" class="btn btn-secondary btn-small" on:click={onBulkDisable}>Disable Visible</button>
        </div>
    </div>
    <div class="rules-table-scroll">
        <table>
            <thead>
                <tr><th>Rule</th><th>Status</th></tr>
            </thead>
            <tbody>
                {#if rules.length > 0}
                    {#each rules as { rule, index }}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <span>{rule.value}</span>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-packaged">Packaged</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="rule-status-cell">
                                    <span class={"rule-state-badge " + (rule.enabled !== false ? "rule-state-badge-on" : "rule-state-badge-off")}>{rule.enabled !== false ? "Enabled" : "Disabled"}</span>
                                    <label class="switch">
                                        <input type="checkbox" checked={rule.enabled !== false} on:change={(event) => onToggle(index, (event.currentTarget as HTMLInputElement).checked)} />
                                        <span class="slider" aria-hidden="true"></span>
                                    </label>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {:else}
                    <tr><td colspan="2" class="no-rules-message">{search ? "No built-in core rules match this search." : "No built-in core rules loaded."}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
