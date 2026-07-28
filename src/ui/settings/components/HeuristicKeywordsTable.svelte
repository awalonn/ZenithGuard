<script lang="ts">
    import type { IndexedToggleableRuleEntry } from "../types";

    export let totalCount = 0;
    export let enabledCount = 0;
    export let search = "";
    export let newKeyword = "";
    export let rules: IndexedToggleableRuleEntry[] = [];
    export let onAdd: () => void | Promise<void>;
    export let onToggle: (index: number, enabled: boolean) => void | Promise<void>;
    export let onDelete: (value: string) => void | Promise<void>;
    export let onBulkEnable: () => void | Promise<void>;
    export let onBulkDisable: () => void | Promise<void>;
    export let onReset: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Heuristic Keywords <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">Fallback keyword matches ZenithGuard can use when deterministic rules do not cover a request yet.</p>
        </div>
    </div>
    <div class="table-note table-note-top table-note-actions">
        <p class="setting-description">{enabledCount} heuristic keywords are currently enabled.</p>
        <button type="button" class="btn btn-secondary btn-small" on:click={onReset}>Restore Recommended Defaults</button>
    </div>
    <form class="add-rule-form" on:submit|preventDefault={onAdd}>
        <input type="text" aria-label="Heuristic keyword" placeholder="Enter heuristic keyword" bind:value={newKeyword} />
        <button type="submit" class="btn btn-primary">Add Keyword</button>
    </form>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search heuristic keywords" bind:value={search} />
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
                <tr><th>Keyword</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if rules.length > 0}
                    {#each rules as { rule, index }}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <span>{rule.value}</span>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-heuristic">Heuristic</span>
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
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onDelete(rule.value)}>Delete</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr><td colspan="3" class="no-rules-message">{search ? "No heuristic keywords match this search." : "No heuristic keywords loaded. Restore defaults if you want ZenithGuard's recommended fallback set back."}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
