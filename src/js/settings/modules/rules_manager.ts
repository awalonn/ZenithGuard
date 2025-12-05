// js/settings/modules/rules_manager.ts
import { BUNDLED_LISTS_PRESETS } from './subscription_presets.js';
import { AppSettings, HidingRule, FilterList } from '../../types.js';

export class RulesManager {
    private settings: AppSettings;
    private showToast: (message: string, type?: 'success' | 'error' | 'info') => void;

    constructor(syncSettings: AppSettings, showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
        this.settings = syncSettings;
        this.showToast = showToast;
        this.attachEventListeners();
        // Add a listener for storage changes to re-render in real-time
        chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    }

    initialize(): void {
        this.render();
    }

    // --- Event Listener Attachment ---
    private attachEventListeners(): void {
        // Using event delegation on the body for dynamically added elements
        document.body.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest('button');
            if (!button) return;

            const { action, type, index, url, rulesetId } = button.dataset;

            if (action === 'delete-rule' && type) this.deleteRule(type as keyof AppSettings, Number(index));
            if (action === 'delete-hiding-domain') this.deleteHidingDomain(type as keyof AppSettings, String(index)); // index here is domain string
            if (action === 'add-subscription') this.addSubscription();
            if (action === 'delete-subscription' && url) this.deleteSubscription(url);
            if (action === 'update-all-lists') this.updateAllLists(button);
            if (action === 'add-heuristic-keyword') this.addHeuristicKeyword();
        });

        document.body.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLElement;
            const toggle = target.closest('input[type="checkbox"]') as HTMLInputElement;
            if (!toggle) return;
            const { action, type, index, url, rulesetId } = toggle.dataset;

            if (action === 'toggle-rule' && type) this.toggleRule(type as keyof AppSettings, Number(index), toggle.checked);
            if (action === 'toggle-subscription' && url) this.toggleSubscription(url, toggle.checked);
            // REFACTORED: Handle static ruleset toggles
            if (action === 'toggle-static-ruleset' && rulesetId) this.toggleStaticRuleset(rulesetId, toggle.checked);
        });
    }

    // --- Core Render Function ---
    async render(): Promise<void> {
        this.renderDefaultBlocklist();
        this.renderNetworkBlocklist();
        this.renderCustomHidingRules();
        this.renderHeuristicKeywords();
        await this.renderBundledFilterLists(); // REFACTORED
        this.renderCustomSubscriptions(); // MODIFIED
        this.renderDynamicListStatuses(); // REFACTORED from renderMalwareListStatus
    }

    // --- NEW: Real-time update on storage change ---
    async handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, area: string): Promise<void> {
        // If static ruleset state changes, we must re-render
        if (area === 'sync' && changes.enabledStaticRulesets) {
            // @ts-ignore - Dynamic property access
            this.settings.enabledStaticRulesets = changes.enabledStaticRulesets.newValue;
            await this.renderBundledFilterLists();
            return; // Only re-render this part
        }

        if (area !== 'sync' && area !== 'local') return;

        let needsRender = false;
        // Keyof check is complex here, keeping it simpler
        const syncKeys = ['defaultBlocklist', 'networkBlocklist', 'customHidingRules', 'heuristicKeywords', 'filterLists'];
        const localKeys = ['malware-list-cache', 'youtube-rules-cache', 'tracker-list-cache'];

        if (area === 'sync') {
            for (const key of syncKeys) {
                if (changes[key]) {
                    // @ts-ignore
                    this.settings[key] = changes[key].newValue;
                    needsRender = true;
                }
            }
        }

        if (area === 'local' && localKeys.some(key => changes[key])) {
            needsRender = true;
        }

        if (needsRender) {
            this.render();
        }
    }

    // --- Subscription Management (REFACTORED) ---

    async renderBundledFilterLists(): Promise<void> {
        const container = document.getElementById('bundled-subscriptions-list');
        if (!container) return;

        // Get the list of currently enabled static rulesets
        // NEW: Get state from sync storage, not from API
        const { enabledStaticRulesets } = await chrome.storage.sync.get('enabledStaticRulesets') as { enabledStaticRulesets?: string[] };

        // If undefined (first run), default to all enabled
        const enabledIds = new Set(
            enabledStaticRulesets || BUNDLED_LISTS_PRESETS.map((p: any) => p.id)
        );

        // Save the default state if it was undefined
        if (!enabledStaticRulesets) {
            await chrome.storage.sync.set({ enabledStaticRulesets: Array.from(enabledIds) });
        }


        container.innerHTML = BUNDLED_LISTS_PRESETS.map(preset => {
            const isEnabled = enabledIds.has(preset.id);
            return `
                <div class="subscription-card">
                    <div class="subscription-card-header">
                        <h4>${preset.name}</h4>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-static-ruleset" data-ruleset-id="${preset.id}" ${isEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <p>${preset.description}</p>
                </div>
            `;
        }).join('');
    }

    renderCustomSubscriptions(): void {
        const tbody = document.getElementById('custom-subscriptions-tbody');
        if (!tbody) return;
        // REFACTORED: filterLists is *only* custom lists now
        const customSubscriptions: FilterList[] = this.settings.filterLists || [];

        if (customSubscriptions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="no-rules-message">No custom subscriptions found.</td></tr>`;
            return;
        }

        tbody.innerHTML = customSubscriptions.map(list => {
            let statusHtml = '';
            // @ts-ignore
            const statusClass = (list.status || 'unknown').toLowerCase();

            if (statusClass === 'updating') {
                statusHtml = `<div class="status-spinner"></div> <span class="status-text updating">Updating...</span>`;
            } else {
                const dotClass = statusClass === 'success' ? 'success' : (statusClass === 'error' ? 'error' : 'unknown');
                // @ts-ignore
                statusHtml = `<div class="status-dot ${dotClass}"></div> <span class="status-text ${dotClass}">${list.status || 'Unknown'}</span>`;
            }

            return `
                <tr>
                    <td class="subscription-status-cell">${statusHtml}</td>
                    <td class="url-cell" title="${list.url}">${list.url}</td>
                    <td>${list.ruleCount || 0}</td>
                    <td>${list.lastUpdated ? new Date(list.lastUpdated).toLocaleString() : 'Never'}</td>
                    <td>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-subscription" data-url="${list.url}" ${list.enabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td><button class="btn btn-danger btn-small" data-action="delete-subscription" data-url="${list.url}">Delete</button></td>
                </tr>
            `;
        }).join('');
    }

    async addSubscription(): Promise<void> {
        const input = document.getElementById('add-subscription-input') as HTMLInputElement;
        if (!input) return;
        const url = input.value.trim();
        if (!url) return;

        try {
            new URL(url); // Validate URL format
        } catch {
            this.showToast('Invalid URL format.', 'error');
            return;
        }

        // REFACTORED: filterLists is *only* custom lists
        const filterLists: FilterList[] = this.settings.filterLists || [];
        if (filterLists.some(list => list.url === url)) {
            this.showToast('This subscription already exists.', 'error');
            return;
        }

        // @ts-ignore - Adding temporary status property
        filterLists.push({ url, enabled: true, status: 'new', id: crypto.randomUUID(), name: 'Custom List' });
        await chrome.storage.sync.set({ filterLists });

        // Immediately trigger an update for the new list
        chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_SINGLE_LIST', url });

        input.value = '';
        this.showToast('Subscription added and is now updating!', 'success');
        this.render(); // Re-render immediately
    }

    async deleteSubscription(url: string): Promise<void> {
        if (!confirm(`Are you sure you want to delete this subscription?\n\n${url}`)) return;
        // REFACTORED: filterLists is *only* custom lists
        const filterLists = this.settings.filterLists.filter(list => list.url !== url);
        await chrome.storage.sync.set({ filterLists });
        this.showToast('Subscription removed.', 'success');
    }

    async toggleSubscription(url: string, isEnabled: boolean): Promise<void> {
        // REFACTORED: This function now *only* manages custom lists in filterLists
        let filterLists = this.settings.filterLists || [];
        const existingList = filterLists.find(l => l.url === url);

        if (existingList) {
            existingList.enabled = isEnabled;
        } else if (isEnabled) {
            // This case should be handled by addSubscription, but included for safety
            // @ts-ignore
            filterLists.push({ url, enabled: true, status: 'new', id: crypto.randomUUID(), name: 'Custom List' });
        }

        await chrome.storage.sync.set({ filterLists });

        // @ts-ignore
        if (isEnabled && (!existingList || existingList.status !== 'success')) {
            chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_SINGLE_LIST', url });
        }

        this.showToast('Custom subscription setting saved.', 'success');
        this.render(); // This will re-render just the custom list table
    }

    // REFACTORED: Handle toggling static, bundled rulesets AND save state
    async toggleStaticRuleset(rulesetId: string, isEnabled: boolean): Promise<void> {
        try {
            // 1. Get current state from storage
            const { enabledStaticRulesets } = await chrome.storage.sync.get('enabledStaticRulesets') as { enabledStaticRulesets?: string[] };
            const enabledIds = new Set(enabledStaticRulesets || BUNDLED_LISTS_PRESETS.map((p: any) => p.id));

            // 2. Update the state
            if (isEnabled) {
                enabledIds.add(rulesetId);
            } else {
                enabledIds.delete(rulesetId);
            }

            // 3. Save the new state back to storage
            await chrome.storage.sync.set({ enabledStaticRulesets: Array.from(enabledIds) });

            // 4. Tell the rule engine to apply all rules (which will use this new state)
            await chrome.runtime.sendMessage({ type: 'APPLY_ALL_RULES' });

            this.showToast('Filter list setting saved!', 'success');
        } catch (e) {
            console.error("Failed to toggle ruleset:", e);
            this.showToast('Error saving setting.', 'error');
            // Re-render to show the previous state
            this.render();
        }
    }

    async updateAllLists(button: HTMLButtonElement): Promise<void> {
        button.disabled = true;
        button.textContent = 'Updating...';
        // REFACTORED: This message now only applies to custom lists
        await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_ALL_FILTER_LISTS' });
        this.showToast('Updating all subscriptions and dynamic lists in the background.', 'success');
        // The button will re-enable on the next render after storage updates
    }


    // REFACTORED: This now handles *all* dynamic lists
    async renderDynamicListStatuses(): Promise<void> {
        const malwareContainer = document.getElementById('malware-list-status');
        const youtubeContainer = document.getElementById('youtube-list-status');
        // NEW: Get tracker container
        const trackerContainer = document.getElementById('tracker-list-status');
        if (!malwareContainer || !youtubeContainer || !trackerContainer) return;

        interface CacheData {
            'malware-list-cache'?: { domains: string[]; lastUpdated: number };
            'youtube-rules-cache'?: { rules: { regexFilters?: any[]; urlFilters?: any[] }; lastUpdated: number };
            'tracker-list-cache'?: { list: any[]; lastUpdated: number };
        }

        const data = await chrome.storage.local.get([
            'malware-list-cache',
            'youtube-rules-cache',
            'tracker-list-cache'
        ]) as CacheData;

        const malwareCache = data['malware-list-cache'];
        const youtubeCache = data['youtube-rules-cache'];
        const trackerCache = data['tracker-list-cache'];

        // Render Malware List Status
        if (malwareCache && malwareCache.domains && malwareCache.domains.length > 0) {
            malwareContainer.innerHTML = `
                <h4>Malware Protection List</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(malwareCache.lastUpdated).toLocaleString()}</strong></p>
                    <p>Blocking <strong>${malwareCache.domains.length.toLocaleString()}</strong> malicious domains.</p>
                </div>
            `;
        } else {
            malwareContainer.innerHTML = `
                <h4>Malware Protection List</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>The list will be fetched automatically in the background.</p>
                </div>
            `;
        }

        // Render YouTube List Status
        if (youtubeCache && youtubeCache.rules) {
            const ruleCount = (youtubeCache.rules.regexFilters?.length || 0) + (youtubeCache.rules.urlFilters?.length || 0);
            youtubeContainer.innerHTML = `
                <h4>YouTube Ad-Blocking Rules</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(youtubeCache.lastUpdated).toLocaleString()}</strong></p>
                    <p>Loaded <strong>${ruleCount}</strong> dynamic rules.</p>
                </div>
            `;
        } else {
            youtubeContainer.innerHTML = `
                <h4>YouTube Ad-Blocking Rules</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>Dynamic rules will be fetched automatically.</p>
                </div>
            `;
        }

        // NEW: Render Tracker List Status
        if (trackerCache && trackerCache.list) {
            // @ts-ignore
            const ruleCount = Object.values(trackerCache.list).reduce((acc: number, val: any) => acc + (val.domains?.length || 0), 0);
            trackerContainer.innerHTML = `
                <h4>Privacy Insights Trackers</h4>
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(trackerCache.lastUpdated).toLocaleString()}</strong></p>
                    <p>Loaded <strong>${ruleCount}</strong> tracker definitions.</p>
                </div>
            `;
        } else {
            trackerContainer.innerHTML = `
                <h4>Privacy Insights Trackers</h4>
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>Dynamic tracker list will be fetched automatically.</p>
                </div>
            `;
        }
    }


    // --- Generic Rule Rendering and Management ---
    renderRuleTable(tbodyId: string, countId: string, rules: any[], type: string): void {
        const tbody = document.getElementById(tbodyId);
        const countEl = document.getElementById(countId);

        if (countEl) countEl.textContent = `(${(rules || []).length})`;
        if (!tbody) return;

        if (!rules || rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="no-rules-message">No rules defined.</td></tr>`;
            return;
        }

        tbody.innerHTML = rules.map((rule, index) => `
            <tr>
                <td class="rule-value-cell" title="${rule.value}">${rule.value}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" data-action="toggle-rule" data-type="${type}" data-index="${index}" ${rule.enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
                ${type !== 'defaultBlocklist' ? `<td><button class="btn btn-danger btn-small" data-action="delete-rule" data-type="${type}" data-index="${index}">Delete</button></td>` : ''}
            </tr>
        `).join('');
    }

    renderDefaultBlocklist(): void {
        const rules = this.settings.defaultBlocklist || [];
        const tbody = document.getElementById('default-blocklist-tbody');
        const countEl = document.getElementById('default-blocklist-count');

        if (countEl) countEl.textContent = `(${rules.length})`;
        if (!tbody) return;

        tbody.innerHTML = rules.map((rule, index) => {
            // @ts-ignore - rule typing needs to be unified
            const val = typeof rule === 'string' ? rule : rule.value;
            // @ts-ignore
            const enabled = typeof rule === 'string' ? true : rule.enabled;
            return `
            <tr>
                <td class="rule-value-cell" title="${val}">${val}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" data-action="toggle-rule" data-type="defaultBlocklist" data-index="${index}" ${enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
            </tr>
        `}).join('');
    }

    renderNetworkBlocklist(): void {
        this.renderRuleTable('network-blocklist-tbody', 'network-blocklist-count', this.settings.networkBlocklist, 'networkBlocklist');
    }

    renderHeuristicKeywords(): void {
        this.renderRuleTable('heuristic-keywords-tbody', 'heuristic-keywords-count', this.settings.heuristicKeywords, 'heuristicKeywords');
    }

    async addHeuristicKeyword(): Promise<void> {
        const input = document.getElementById('add-heuristic-keyword-input') as HTMLInputElement;
        if (!input) return;

        const value = input.value.trim();
        if (!value) {
            this.showToast('Keyword cannot be empty.', 'error');
            return;
        }

        const type = 'heuristicKeywords';
        // @ts-ignore
        const rules: string[] = this.settings[type] || [];

        if (rules.includes(value)) {
            this.showToast('This keyword already exists.', 'error');
            return;
        }

        rules.push(value);
        // @ts-ignore
        await chrome.storage.sync.set({ [type]: rules });

        this.showToast('Heuristic keyword added!', 'success');
        input.value = '';
        // The storage listener will automatically re-render the table
    }

    renderCustomHidingRules(): void {
        const rules = this.settings.customHidingRules || {};
        const tbody = document.getElementById('hiding-rules-tbody');
        const countEl = document.getElementById('hiding-rules-count');
        const domains = Object.keys(rules).filter(domain => rules[domain].length > 0);

        if (countEl) countEl.textContent = `(${domains.length})`;
        if (!tbody) return;

        if (domains.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="no-rules-message">No rules defined.</td></tr>`;
            return;
        }

        tbody.innerHTML = domains.map(domain => `
            <tr>
                <td>${domain}</td>
                <td>${rules[domain].length} rule(s)</td>
                <td><button class="btn btn-danger btn-small" data-action="delete-hiding-domain" data-type="customHidingRules" data-index="${domain}">Delete All</button></td>
            </tr>
        `).join('');
    }

    async toggleRule(type: keyof AppSettings, index: number, isEnabled: boolean): Promise<void> {
        // @ts-ignore - Array access
        if (!this.settings[type] || !this.settings[type][index]) return;
        // @ts-ignore
        this.settings[type][index].enabled = isEnabled;
        // @ts-ignore
        await chrome.storage.sync.set({ [type]: this.settings[type] });
        this.showToast('Rule setting saved!', 'success');
    }

    async deleteRule(type: keyof AppSettings, index: number): Promise<void> {
        // @ts-ignore
        if (!this.settings[type] || !this.settings[type][index]) return;
        // @ts-ignore
        this.settings[type].splice(index, 1);
        // @ts-ignore
        await chrome.storage.sync.set({ [type]: this.settings[type] });
        this.showToast('Rule deleted!', 'success');
    }

    async deleteHidingDomain(type: keyof AppSettings, domain: string): Promise<void> {
        // @ts-ignore
        if (!this.settings[type] || !this.settings[type][domain]) return;
        if (confirm(`Are you sure you want to delete all hiding rules for ${domain}?`)) {
            // @ts-ignore
            delete this.settings[type][domain];
            // @ts-ignore
            await chrome.storage.sync.set({ [type]: this.settings[type] });
            this.showToast(`Rules for ${domain} deleted!`, 'success');
        }
    }
}