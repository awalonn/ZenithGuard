// js/settings/modules/rules_manager.ts
import { BUNDLED_LISTS_PRESETS } from './subscription_presets.js';
import { AppSettings, HidingRule, FilterList } from '../../types.js';

export class RulesManager {
    private settings: AppSettings;
    private expandedDomains: Set<string> = new Set();
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

    private attachEventListeners(): void {
        // Using event delegation on the body for dynamically added elements
        document.body.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest('button');
            if (!button) return;

            const { action, type, index, url, rulesetId, domain } = button.dataset;

            if (action === 'delete-rule' && type) this.deleteRule(type as keyof AppSettings, Number(index));
            if (action === 'delete-hiding-domain') this.deleteHidingDomain(type as keyof AppSettings, String(index));
            if (action === 'add-subscription') this.addSubscription();
            if (action === 'delete-subscription' && url) this.deleteSubscription(url);
            if (action === 'update-all-lists') this.updateAllLists(button);
            if (action === 'add-heuristic-keyword') this.addHeuristicKeyword();
            if (action === 'add-focus-domain') this.addFocusDomain();
            if (action === 'delete-focus-domain' && domain) this.deleteFocusDomain(domain);

            // NEW: Granular Zapper Control
            if (action === 'toggle-domain-rules' && domain) this.toggleDomainRules(domain);
            if (action === 'delete-single-hiding-rule' && domain && index) this.deleteSingleHidingRule(domain, Number(index));

            // NEW: Network Blocklist Addition
            if (action === 'add-network-rule') this.addNetworkRule();
        });

        document.body.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLElement;
            const toggle = target.closest('input[type="checkbox"]') as HTMLInputElement;
            if (!toggle) return;
            const { action, type, index, url, rulesetId } = toggle.dataset;

            if (action === 'toggle-rule' && type) this.toggleRule(type as keyof AppSettings, Number(index), toggle.checked);
            if (action === 'toggle-subscription' && url) this.toggleSubscription(url, toggle.checked);
            if (action === 'toggle-static-ruleset' && rulesetId) this.toggleStaticRuleset(rulesetId, toggle.checked);
        });
    }

    // --- Core Render Function ---
    async render(): Promise<void> {
        this.renderDefaultBlocklist();
        this.renderNetworkBlocklist();
        this.renderFocusBlocklist(); // NEW
        this.renderCustomHidingRules();
        this.renderHeuristicKeywords();
        await this.renderBundledFilterLists();
        await this.renderCosmeticRuleStats(); // NEW: Phase 3
        this.renderCustomSubscriptions();
        this.renderDynamicListStatuses();
    }

    // --- NEW: Real-time update on storage change ---
    async handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }, area: string): Promise<void> {
        // If static ruleset state changes, we must re-render
        if (area === 'sync' && changes.enabledStaticRulesets) {
            // SAFE: We know 'enabledStaticRulesets' exists in AppSettings
            this.settings.enabledStaticRulesets = changes.enabledStaticRulesets.newValue as string[];
            await this.renderBundledFilterLists();
            return; // Only re-render this part
        }

        if (area !== 'sync' && area !== 'local') return;

        let needsRender = false;
        // Keyof check is complex here, keeping it simpler
        const syncKeys = ['defaultBlocklist', 'networkBlocklist', 'customHidingRules', 'heuristicKeywords', 'filterLists', 'focusBlocklist'];
        const localKeys = ['malware-list-cache', 'youtube-rules-cache', 'tracker-list-cache'];

        if (area === 'sync') {
            for (const key of syncKeys) {
                if (changes[key]) {
                    const settingKey = key as keyof AppSettings;
                    // @ts-expect-error - Dynamic assignment is complex with strict types, but safe here due to key whitelist
                    this.settings[settingKey] = changes[key].newValue;
                    needsRender = true;
                }
            }
        }

        if (area === 'local') {
            if (localKeys.some(key => changes[key])) {
                needsRender = true;
            }
            // NEW: Watch for filter list updates (e.g. filterlist-https://...)
            // to update the rule counts in the UI
            if (Object.keys(changes).some(key => key.startsWith('filterlist-'))) {
                needsRender = true;
            }
        }

        if (needsRender) {
            this.render();
        }
    }

    // --- Subscription Management (REFACTORED) ---

    async renderBundledFilterLists(): Promise<void> {
        const container = document.getElementById('bundled-subscriptions-list');
        if (!container) return;

        // Get enabled state
        const { enabledStaticRulesets } = await chrome.storage.sync.get('enabledStaticRulesets') as { enabledStaticRulesets?: string[] };

        // Get cached stats for dynamic/cosmetic updates
        // We need to fetch all keys starting with 'filterlist-'... but chrome.storage.get doesn't support wildcards.
        // So we iterate the presets and build the keys.
        const keysToFetch = BUNDLED_LISTS_PRESETS.map(p => `filterlist-${p.sourceUrl}`);
        const cacheData = await chrome.storage.local.get(keysToFetch) as Record<string, any>;

        const enabledIds = new Set(
            enabledStaticRulesets || BUNDLED_LISTS_PRESETS.map((p: any) => p.id)
        );

        if (!enabledStaticRulesets) {
            await chrome.storage.sync.set({ enabledStaticRulesets: Array.from(enabledIds) });
        }

        container.innerHTML = BUNDLED_LISTS_PRESETS.map(preset => {
            const isEnabled = enabledIds.has(preset.id);
            const cacheKey = `filterlist-${preset.sourceUrl}`;
            const cachedInfo = cacheData[cacheKey];

            let statusHtml = '';
            let statsHtml = '';

            if (cachedInfo) {
                const lastUpdated = new Date(cachedInfo.lastUpdated).toLocaleString();
                // Count cosmetic rules
                const ruleCount = Object.values(cachedInfo.cosmeticRules || {}).reduce((acc: number, val: any) => acc + (val.length || 0), 0);

                statusHtml = `
                    <div class="status-indicator small">
                        <div class="status-dot success"></div>
                        <span>Hybrid Active</span>
                    </div>`;

                statsHtml = `
                    <div class="list-stats">
                        <span><small>Cosmetic Rules:</small> <strong>${ruleCount}</strong></span>
                        <span><small>Updates:</small> <strong>${lastUpdated}</strong></span>
                    </div>`;
            } else if (isEnabled) {
                statusHtml = `
                    <div class="status-indicator small">
                        <div class="status-dot warning"></div>
                        <span>Static Only (Update Required)</span>
                    </div>`;
            }

            return `
                <div class="subscription-card">
                    <div class="subscription-card-header">
                        <div class="header-left">
                            <h4>${preset.name}</h4>
                            ${statusHtml}
                        </div>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-static-ruleset" data-ruleset-id="${preset.id}" ${isEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <p>${preset.description}</p>
                    ${statsHtml}
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
            // SAFE: FilterList interface has optional status
            const statusClass = (list.status || 'unknown').toLowerCase();

            if (statusClass === 'updating') {
                statusHtml = `<div class="status-spinner"></div> <span class="status-text updating">Updating...</span>`;
            } else {
                const dotClass = statusClass === 'success' ? 'success' : (statusClass === 'error' ? 'error' : 'unknown');
                // SAFE: status is string or undefined
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

        // SAFE: Explicitly matching FilterList interface including optional status
        const newList: FilterList = { url, enabled: true, status: 'new', id: crypto.randomUUID(), name: 'Custom List' };
        filterLists.push(newList);
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
            const newList: FilterList = { url, enabled: true, status: 'new', id: crypto.randomUUID(), name: 'Custom List' };
            filterLists.push(newList);
        }

        await chrome.storage.sync.set({ filterLists });

        // SAFE: Check status safely
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
        const originalText = button.textContent || 'Update Cosmetic Filters Now';
        button.disabled = true;
        button.textContent = 'Updating...';

        try {
            await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_ALL_FILTER_LISTS' });
            this.showToast('Cosmetic filters updated successfully.', 'success');
        } catch (error) {
            this.showToast('Failed to update filters.', 'error');
            console.error(error);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
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
            // SAFE: Cast list values to CheckableDomain object structure
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


    // --- NEW: Phase 3 - Cosmetic Rule Stats Display ---
    async renderCosmeticRuleStats(): Promise<void> {
        const keysToFetch = BUNDLED_LISTS_PRESETS.map(p => `filterlist-${p.sourceUrl}`);
        const cacheData = await chrome.storage.local.get(keysToFetch) as Record<string, any>;

        for (const preset of BUNDLED_LISTS_PRESETS) {
            const cacheKey = `filterlist-${preset.sourceUrl}`;
            const cachedInfo = cacheData[cacheKey];
            const elementId = `${preset.id}-cosmetic-count`;
            const element = document.getElementById(elementId);

            if (element) {
                if (cachedInfo && cachedInfo.cosmeticRules) {
                    const count = Object.values(cachedInfo.cosmeticRules || {})
                        .reduce((acc: number, val: any) => acc + (val.length || 0), 0);
                    element.textContent = `${count.toLocaleString()} rules`;
                    element.style.color = '#a5f3fc'; // Cyan for active
                } else {
                    element.textContent = 'Not cached (click Update)';
                    element.style.color = 'rgba(255, 255, 255, 0.5)'; // Muted for inactive
                }
            }
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
            // SAFE: defaultBlocklist can be string[] or object[] based on legacy data
            // We treat it as any for the mapping to handle both cases
            const item = rule as any;
            const val = typeof rule === 'string' ? rule : item.value;
            const enabled = typeof rule === 'string' ? true : item.enabled;
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
        // SAFE: Explicit cast
        let rules = (this.settings[type] as string[]) || [];

        if (rules.includes(value)) {
            this.showToast('This keyword already exists.', 'error');
            return;
        }

        rules.push(value);
        // SAFE: Dynamic key set
        await chrome.storage.sync.set({ [type]: rules });

        this.showToast('Heuristic keyword added!', 'success');
        input.value = '';
        // The storage listener will automatically re-render the table
    }

    // --- Focus Mode Blocklist ---

    renderFocusBlocklist(): void {
        const rules = this.settings.focusBlocklist || [];
        const tbody = document.getElementById('focus-blocklist-tbody');
        const countEl = document.getElementById('focus-blocklist-count');

        if (countEl) countEl.textContent = `(${rules.length})`;
        if (!tbody) return;

        if (rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="no-rules-message">No custom sites. Using defaults.</td></tr>`;
            return;
        }

        tbody.innerHTML = rules.map((domain: string) => `
            <tr>
                <td class="rule-value-cell" title="${domain}">${domain}</td>
                <td>
                    <button class="btn btn-danger btn-small" data-action="delete-focus-domain" data-domain="${domain}">Remove</button>
                </td>
            </tr>
        `).join('');
    }

    async addNetworkRule(): Promise<void> {
        const input = document.getElementById('add-network-domain-input') as HTMLInputElement;
        if (!input) return;
        const domain = input.value.trim();

        if (!domain) {
            this.showToast('Domain cannot be empty.', 'error');
            return;
        }

        const list = this.settings.networkBlocklist || [];

        // Check for duplicates
        if (list.some(rule => rule.value === domain)) {
            this.showToast('Domain is already in the blocklist.', 'error');
            return;
        }

        list.push({ value: domain, enabled: true });

        // Optimistic UI update handled by re-render on storage change, 
        // but we save first.
        await chrome.storage.sync.set({ networkBlocklist: list });
        this.showToast('Domain added to network blocklist.', 'success');
        input.value = '';
    }

    async addFocusDomain(): Promise<void> {
        const input = document.getElementById('add-focus-domain-input') as HTMLInputElement;
        if (!input) return;
        const domain = input.value.trim();

        if (!domain) {
            this.showToast('Domain cannot be empty.', 'error');
            return;
        }

        let list = this.settings.focusBlocklist || [];

        // Initialize with default if it was empty, so we don't handle mixed states? 
        // No, design decision: if user adds ONE custom, they manage the whole list. 
        // Or we merge? 
        // Current logic in manager: if list > 0 use list, else default.
        // So if they add "foo.com", they LOSE "youtube.com" unless they add it back.
        // Let's warn or populate defaults first.

        if (list.length === 0) {
            // Populate with defaults first so they don't accidentally unblock everything else
            // We need to fetch DEFAULT_DISTRACTING_SITES? It's not imported.
            // Hardcoded here for convenience or import it? 
            // Let's just import it or duplicate it safely.
            // For now, let's assume they want to build from scratch OR we just add it to the empty list.
            // Better user experience: If list is empty, pre-fill with defaults + new one.
            const DEFAULT_SITES = [
                'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
                'reddit.com', 'youtube.com', 'netflix.com', 'twitch.tv', 'discord.com'
            ];
            list = [...DEFAULT_SITES];
        }

        if (list.includes(domain)) {
            this.showToast('Domain is already blocked.', 'error');
            return;
        }

        list.push(domain);
        await chrome.storage.sync.set({ focusBlocklist: list });
        this.showToast('Focus domain added.', 'success');
        input.value = '';
    }

    async deleteFocusDomain(domain: string): Promise<void> {
        let list = this.settings.focusBlocklist || [];
        if (list.length === 0) return;

        list = list.filter((d: string) => d !== domain);
        await chrome.storage.sync.set({ focusBlocklist: list });
        this.showToast('Focus domain removed.', 'success');
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

        tbody.innerHTML = domains.map(domain => {
            const domainRules = rules[domain];
            const isExpanded = this.expandedDomains.has(domain);

            // Main Domain Row
            let html = `
            <tr class="domain-row">
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="icon-toggle-btn ${isExpanded ? 'expanded' : ''}" data-action="toggle-domain-rules" data-domain="${domain}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
                        </button>
                        <strong>${domain}</strong>
                    </div>
                </td>
                <td>${domainRules.length} rule(s)</td>
                <td style="text-align: right;">
                    <button class="btn btn-danger btn-small" data-action="delete-hiding-domain" data-type="customHidingRules" data-index="${domain}">Delete All</button>
                </td>
            </tr>
            `;

            // Expanded Details Row
            if (isExpanded) {
                const rulesListObj = domainRules.map((rule, idx) => `
                    <div class="rule-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <code style="font-size: 11px; word-break: break-all; color: #a5f3fc;">${rule.value}</code>
                        <button class="icon-btn-danger" title="Delete Rule" data-action="delete-single-hiding-rule" data-domain="${domain}" data-index="${idx}">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
                        </button>
                    </div>
                `).join('');

                html += `
                <tr class="details-row">
                    <td colspan="3" style="padding: 0 0 0 34px; background: rgba(0,0,0,0.1);">
                        <div class="rules-list-container" style="padding: 10px 0;">
                            ${rulesListObj}
                        </div>
                    </td>
                </tr>
                `;
            }

            return html;
        }).join('');
    }

    toggleDomainRules(domain: string): void {
        if (this.expandedDomains.has(domain)) {
            this.expandedDomains.delete(domain);
        } else {
            this.expandedDomains.add(domain);
        }
        this.renderCustomHidingRules();
    }

    async deleteSingleHidingRule(domain: string, index: number): Promise<void> {
        if (!this.settings.customHidingRules || !this.settings.customHidingRules[domain]) return;

        // Optimistic UI update avoidance or rely on render?
        // Since we modify storage, we should wait for storage update or update local + storage.
        // Updating local + storage avoids flickering if storage listener is slow.

        const ruleValue = this.settings.customHidingRules[domain][index].value;

        if (!confirm(`Delete this rule?\n\n${ruleValue}`)) return;

        this.settings.customHidingRules[domain].splice(index, 1);

        // If empty, delete the domain key entirely
        if (this.settings.customHidingRules[domain].length === 0) {
            delete this.settings.customHidingRules[domain];
            this.expandedDomains.delete(domain);
        }

        await chrome.storage.sync.set({ customHidingRules: this.settings.customHidingRules });

        // Notify content scripts to re-apply rules immediately
        chrome.runtime.sendMessage({ type: 'REAPPLY_HIDING_RULES' });

        this.showToast('Rule deleted.', 'success');
        // render() is called by storage listener, but we can call it here for instant feedback if listener is slow?
        // Listener handles it.
    }

    async toggleRule(type: keyof AppSettings, index: number, isEnabled: boolean): Promise<void> {
        // SAFE: We access settings via dynamic key, asserting it's an array-based setting
        const list = this.settings[type];
        if (!Array.isArray(list) || !list[index]) return;

        // SAFE: We modify the item safely assuming standard structure {value, enabled}
        (list[index] as any).enabled = isEnabled;

        await chrome.storage.sync.set({ [type]: list });
        this.showToast('Rule setting saved!', 'success');
    }

    async deleteRule(type: keyof AppSettings, index: number): Promise<void> {
        // SAFE: Cast to array for splicing
        const list = this.settings[type];
        if (!Array.isArray(list) || !list[index]) return;

        list.splice(index, 1);

        await chrome.storage.sync.set({ [type]: list });
        this.showToast('Rule deleted!', 'success');
    }

    async deleteHidingDomain(type: keyof AppSettings, domain: string): Promise<void> {
        // SAFE: Specific cast for dictionary type
        const dict = this.settings[type] as Record<string, any>;
        if (!dict || !dict[domain]) return;

        if (confirm(`Are you sure you want to delete all hiding rules for ${domain}?`)) {
            delete dict[domain];

            await chrome.storage.sync.set({ [type]: dict });
            this.showToast(`Rules for ${domain} deleted!`, 'success');
        }
    }
}