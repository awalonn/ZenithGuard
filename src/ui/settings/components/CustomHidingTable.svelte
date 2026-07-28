<script lang="ts">
    import type { CustomHidingRules } from "../types";

    export let totalCount = 0;
    export let search = "";
    export let domains: Array<[string, CustomHidingRules[string]]> = [];
    export let expandedDomains: Set<string>;
    export let formatRuleTimestamp: (timestamp?: number) => string;
    export let onToggleDomain: (domain: string) => void;
    export let onDeleteDomain: (domain: string) => void | Promise<void>;
    export let onDeleteRule: (domain: string, index: number, value: string) => void | Promise<void>;
    export let onClearSearch: () => void;
</script>

<div class="rules-table">
    <div class="rules-table-header">
        <div>
            <h3>Custom Element Hiding <span class="rule-count">({totalCount})</span></h3>
            <p class="setting-description">Site-specific cleanup rules created from Zapper, Inspector, or self-heal.</p>
        </div>
    </div>
    <div class="rules-table-tools">
        <input type="search" class="rules-search-input" placeholder="Search custom hidden elements" bind:value={search} />
        {#if search}
            <div class="rules-table-actions">
                <button type="button" class="btn btn-secondary btn-small" on:click={onClearSearch}>Clear Filter</button>
            </div>
        {/if}
    </div>
    <div class="rules-table-scroll">
        <table>
            <thead>
                <tr><th>Domain</th><th>Rules</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {#if domains.length > 0}
                    {#each domains as [domain, rules]}
                        <tr class="domain-row">
                            <td>
                                <div class="domain-row-main">
                                    <button type="button" on:click={() => onToggleDomain(domain)} aria-label={expandedDomains.has(domain) ? `Collapse ${domain}` : `Expand ${domain}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style:transform={expandedDomains.has(domain) ? "rotate(180deg)" : "none"}>
                                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path>
                                        </svg>
                                    </button>
                                    <strong>{domain}</strong>
                                    <span class="rule-origin-label rule-origin-label-popup">Popup</span>
                                    {#if rules.some((rule) => rule.lastHealed || rule.lastHealAttempt)}
                                        <span class="rule-origin-label rule-origin-label-saved">Self-heal activity</span>
                                    {/if}
                                </div>
                            </td>
                            <td>{rules.length} rule{rules.length === 1 ? "" : "s"}</td>
                            <td class="actions-cell"><button type="button" class="btn btn-danger btn-small" on:click={() => onDeleteDomain(domain)}>Delete All</button></td>
                        </tr>
                        {#if expandedDomains.has(domain)}
                            <tr class="details-row">
                                <td colspan="3" class="details-cell">
                                    <div class="rules-list-container">
                                        {#each rules as rule, index}
                                            <div class="rule-item">
                                                <div class="rule-item-main">
                                                    <code class="rule-code rule-code-primary">{rule.value}</code>
                                                    {#if rule.lastHealed}
                                                        <span class="rule-change-hint">Last healed {formatRuleTimestamp(rule.lastHealed)}</span>
                                                    {:else if rule.lastHealAttempt}
                                                        <span class="rule-change-hint">Last heal attempt {formatRuleTimestamp(rule.lastHealAttempt)}</span>
                                                    {/if}
                                                </div>
                                                <button type="button" class="icon-btn-danger" title="Delete Rule" on:click={() => onDeleteRule(domain, index, rule.value)}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                                        <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                {:else}
                    <tr><td colspan="3" class="no-rules-message">{search ? "No custom hidden elements match this search." : "No hidden-element rules yet. Use Zapper or Inspector from the popup to create site cleanup rules."}</td></tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>
