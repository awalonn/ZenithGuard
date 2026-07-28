<script lang="ts">
    import type { IndexedToggleableRuleEntry } from "../types";

    export let title = "";
    export let count = 0;
    export let description = "";
    export let note = "";
    export let inputLabel = "";
    export let inputPlaceholder = "";
    export let addButtonLabel = "Add Site";
    export let searchPlaceholder = "";
    export let search = "";
    export let newDomain = "";
    export let entries: IndexedToggleableRuleEntry[] = [];
    export let emptySearchMessage = "";
    export let emptyDefaultMessage = "";
    export let onAdd: () => void | Promise<void>;
    export let onToggle: (index: number, enabled: boolean) => void | Promise<void>;
    export let onRemove: (value: string) => void | Promise<void>;
    export let onBulkEnable: () => void | Promise<void>;
    export let onBulkDisable: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>{title} <span class="rule-count">({count})</span></h3>
            <p class="setting-description">{description}</p>
        </div>
    </div>
    <p class="setting-description table-note">{note}</p>
    <form class="add-rule-form" on:submit|preventDefault={onAdd}>
        <input type="text" aria-label={inputLabel} placeholder={inputPlaceholder} bind:value={newDomain} />
        <button type="submit" class="btn btn-primary">{addButtonLabel}</button>
    </form>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder={searchPlaceholder} bind:value={search} />
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
                <tr><th>Domain</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if entries.length > 0}
                    {#each entries as { rule, index }}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <span>{rule.value}</span>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-policy">Site Policy</span>
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
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onRemove(rule.value)}>Remove</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr>
                        <td colspan="3" class="no-rules-message">{search ? emptySearchMessage : emptyDefaultMessage}</td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
