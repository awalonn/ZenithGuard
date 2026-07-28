<script lang="ts">
    export let totalCount = 0;
    export let usesDefaults = true;
    export let search = "";
    export let newDomain = "";
    export let domains: string[] = [];
    export let onAdd: () => void | Promise<void>;
    export let onRemove: (domain: string) => void | Promise<void>;
    export let onReset: () => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Focus Mode Domains <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">Domains ZenithGuard will treat as distraction targets when Focus Mode is running.</p>
        </div>
    </div>
    {#if usesDefaults}
        <p class="setting-description table-note table-note-top">ZenithGuard is currently using its default distracting-site list. Adding or removing a domain here will create a custom override list for Focus Mode.</p>
    {:else}
        <div class="table-note table-note-top table-note-actions">
            <p class="setting-description">You are using a custom Focus Mode override list instead of the built-in defaults.</p>
            <button type="button" class="btn btn-secondary btn-small" on:click={onReset}>Reset to Defaults</button>
        </div>
    {/if}
    <form class="add-rule-form" on:submit|preventDefault={onAdd}>
        <input type="text" aria-label="Domain to add to focus mode" placeholder="Enter domain or URL" bind:value={newDomain} />
        <button type="submit" class="btn btn-primary">Add Site</button>
    </form>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search focus mode domains" bind:value={search} />
        {#if search}
            <div class="rules-table-actions">
                <button type="button" class="btn btn-secondary btn-small" on:click={onClearSearch}>Clear Filter</button>
            </div>
        {/if}
    </div>
    <div class="rules-table-scroll">
        <table>
            <thead>
                <tr><th>Domain</th><th>Source</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if domains.length > 0}
                    {#each domains as domain}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <span>{domain}</span>
                                    <div class="rule-row-meta">
                                        <span class={usesDefaults ? "rule-origin-label" : "rule-origin-label rule-origin-label-custom"}>{usesDefaults ? "Default" : "Custom"}</span>
                                        <span class="rule-state-badge rule-state-badge-on">Active</span>
                                    </div>
                                </div>
                            </td>
                            <td><span class={usesDefaults ? "rule-origin-label" : "rule-origin-label rule-origin-label-custom"}>{usesDefaults ? "Default" : "Custom"}</span></td>
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onRemove(domain)}>Remove</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr><td colspan="3" class="no-rules-message">{search ? "No focus mode domains match this search." : "No focus mode domains available."}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
