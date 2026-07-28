<script lang="ts">
    export let totalCount = 0;
    export let newDomain = "";
    export let search = "";
    export let pausedSites: string[] = [];
    export let onAdd: () => void | Promise<void>;
    export let onResume: (domain: string) => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Protection Paused on Sites <span class="rule-count rule-count-success">({totalCount})</span></h3>
            <p class="setting-description">ZenithGuard stands down completely on these domains until you remove them.</p>
        </div>
    </div>
    <form class="add-rule-form" on:submit|preventDefault={onAdd}>
        <input type="text" aria-label="Domain to pause protection on" placeholder="Enter domain or URL" bind:value={newDomain} />
        <button type="submit" class="btn btn-primary">Pause Site</button>
    </form>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search paused sites" bind:value={search} />
        {#if search}
            <div class="rules-table-actions">
                <button type="button" class="btn btn-secondary btn-small" on:click={onClearSearch}>Clear Filter</button>
            </div>
        {/if}
    </div>
    <div class="rules-table-scroll">
        <table>
            <thead>
                <tr><th>Domain</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if pausedSites.length > 0}
                    {#each pausedSites as domain}
                        <tr>
                            <td>
                                <div class="rule-row-primary">
                                    <strong>{domain}</strong>
                                    <div class="rule-row-meta">
                                        <span class="rule-origin-label rule-origin-label-custom">Custom</span>
                                        <span class="rule-state-badge rule-state-badge-off">Paused</span>
                                    </div>
                                </div>
                            </td>
                            <td><button type="button" class="btn btn-danger btn-small" on:click={() => onResume(domain)}>Resume Protection</button></td>
                        </tr>
                    {/each}
                {:else}
                    <tr>
                        <td colspan="2" class="no-rules-message">
                            {search ? "No paused sites match this search." : "No paused sites. Protection is currently running normally on every domain."}
                        </td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
