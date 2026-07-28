<script lang="ts">
    import { getNetworkRuleMeta } from "../rules_controller";
    import type { IndexedToggleableRuleEntry, NetworkBlocklistMeta, NetworkRuleOriginFilter } from "../types";

    export let totalCount = 0;
    export let search = "";
    export let originFilter: NetworkRuleOriginFilter = "all";
    export let newDomain = "";
    export let rules: IndexedToggleableRuleEntry[] = [];
    export let meta: NetworkBlocklistMeta = {};
    export let formatRuleTimestamp: (timestamp?: number) => string;
    export let getCustomOriginLabel: (source?: string) => string;
    export let onAdd: () => void | Promise<void>;
    export let onToggle: (index: number, enabled: boolean) => void | Promise<void>;
    export let onDelete: (value: string) => void | Promise<void>;
    export let onBulkEnable: () => void | Promise<void>;
    export let onBulkDisable: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table" id="network-blocklist-rules">
    <div class="rules-table-header">
        <div>
            <h3>Network Blocklist <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">Custom host blocks added manually or from ZenithGuard tools.</p>
        </div>
    </div>
    <form class="add-rule-form" on:submit|preventDefault={onAdd}>
        <input type="text" aria-label="Domain to add to network blocklist" placeholder="Enter domain or URL" bind:value={newDomain} />
        <button type="submit" class="btn btn-primary">Add Rule</button>
    </form>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search custom network blocks" bind:value={search} />
        <select class="rules-origin-filter" aria-label="Filter custom network blocks by origin" bind:value={originFilter}>
            <option value="all">All origins</option>
            <option value="logger">Added from Logger</option>
            <option value="analyzer">Added from Analyzer</option>
            <option value="inspector">Added from Inspector</option>
            <option value="settings">Added in Settings</option>
            <option value="local-ai">Added from Local AI</option>
            <option value="custom">Unknown origin</option>
        </select>
        <div class="rules-table-actions">
            {#if search || originFilter !== "all"}
                <button type="button" class="btn btn-secondary btn-small" on:click={onClearSearch}>Clear Filter</button>
            {/if}
            <button type="button" class="btn btn-secondary btn-small" on:click={onBulkEnable}>Enable Visible</button>
            <button type="button" class="btn btn-secondary btn-small" on:click={onBulkDisable}>Disable Visible</button>
        </div>
    </div>
    <div class="rules-table-scroll">
        <table>
            <thead>
                <tr><th>Rule</th><th>Status</th><th>Added</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if rules.length > 0}
                    {#each rules as { rule, index }}
                        {@const ruleMeta = getNetworkRuleMeta(rule.value, meta)}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <span>{rule.value}</span>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-custom">{getCustomOriginLabel(ruleMeta?.source)}</span>
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
                            <td>{formatRuleTimestamp(ruleMeta?.addedAt)}</td>
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onDelete(rule.value)}>Delete</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr><td colspan="4" class="no-rules-message">{search || originFilter !== "all" ? "No custom network blocks match these filters." : "No custom network blocks yet. Add a specific host from Analyzer, Logger, or Local AI when you need one."}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
