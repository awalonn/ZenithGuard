<script lang="ts">
    import type { PersistentWallFixMap } from "../types";

    export let totalCount = 0;
    export let search = "";
    export let wallFixes: Array<[string, PersistentWallFixMap[string]]> = [];
    export let onToggle: (domain: string, enabled: boolean) => void | Promise<void>;
    export let onRemove: (domain: string) => void | Promise<void>;
    export let onBulkEnable: () => void | Promise<void>;
    export let onBulkDisable: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Persistent Wall Fixes <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">Stored overlay-removal fixes created by ZenithGuard for stubborn adblock walls.</p>
        </div>
    </div>
    <p class="setting-description table-note">Keep these only when a site really needs them. Disabling or removing a stale fix can help avoid odd page behavior later.</p>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search wall fixes by domain or selector" bind:value={search} />
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
                <tr><th>Domain</th><th>Fix</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if wallFixes.length > 0}
                    {#each wallFixes as [domain, fix]}
                        <tr class="domain-row">
                            <td>
                                <div class="rule-row-primary">
                                    <strong>{domain}</strong>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-saved">Saved</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="rule-item-stack">
                                    <code class="rule-code rule-code-primary">overlay: {String(fix.overlaySelector || "n/a")}</code>
                                    {#if fix.scrollSelector}
                                        <code class="rule-code rule-code-secondary">scroll: {String(fix.scrollSelector)}</code>
                                    {/if}
                                </div>
                            </td>
                            <td>
                                <div class="rule-status-cell">
                                    <span class={"rule-state-badge " + (fix.enabled !== false ? "rule-state-badge-on" : "rule-state-badge-off")}>{fix.enabled !== false ? "Enabled" : "Disabled"}</span>
                                    <label class="switch">
                                        <input type="checkbox" checked={fix.enabled !== false} on:change={(event) => onToggle(domain, (event.currentTarget as HTMLInputElement).checked)} />
                                        <span class="slider" aria-hidden="true"></span>
                                    </label>
                                </div>
                            </td>
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onRemove(domain)}>Remove</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr>
                        <td colspan="4" class="no-rules-message">{search ? "No wall fixes match this search." : "No saved wall fixes. Use Defeat Wall only when a page really needs a persistent overlay fix."}</td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
