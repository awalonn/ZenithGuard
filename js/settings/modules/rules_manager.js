// js/settings/modules/rules_manager.js
import { SUBSCRIPTION_PRESETS } from './subscription_presets.js';

export class RulesManager {
    constructor(syncSettings, showToast) {
        this.settings = syncSettings;
        this.showToast = showToast;
        this.attachEventListeners();
        // Add a listener for storage changes to re-render in real-time
        chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    }

    initialize() {
        this.render();
    }
    
    // --- Event Listener Attachment ---
    attachEventListeners() {
        // Using event delegation on the body for dynamically added elements
        document.body.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const { action, type, index, url } = button.dataset;

            if (action === 'delete-rule') this.deleteRule(type, index, button);
            if (action === 'delete-hiding-domain') this.deleteHidingDomain(type, index);
            if (action === 'add-subscription') this.addSubscription();
            if (action === 'delete-subscription') this.deleteSubscription(url, button);
            if (action === 'update-all-lists') this.updateAllLists(button);
            if (action === 'add-heuristic-keyword') this.addHeuristicKeyword();
        });

        document.body.addEventListener('change', (e) => {
             const toggle = e.target.closest('input[type="checkbox"]');
             if (!toggle) return;
             const { action, type, index, url } = toggle.dataset;

             if (action === 'toggle-rule') this.toggleRule(type, index, toggle.checked);
             if (action === 'toggle-subscription') this.toggleSubscription(url, toggle.checked);
        });
    }

    // --- Core Render Function ---
    render() {
        this.renderDefaultBlocklist();
        this.renderNetworkBlocklist();
        this.renderCustomHidingRules();
        this.renderHeuristicKeywords();
        this.renderRecommendedSubscriptions(); // NEW
        this.renderCustomSubscriptions(); // MODIFIED
        this.renderMalwareListStatus();
    }
    
    // --- NEW: Real-time update on storage change ---
    async handleStorageChange(changes, area) {
        if (area !== 'sync' && area !== 'local') return;

        let needsRender = false;
        const syncKeys = ['defaultBlocklist', 'networkBlocklist', 'customHidingRules', 'heuristicKeywords', 'filterLists'];
        const localKeys = ['malware-list-cache'];

        if (area === 'sync') {
            for (const key of syncKeys) {
                if (changes[key]) {
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
    
    renderRecommendedSubscriptions() {
        const container = document.getElementById('recommended-subscriptions-list');
        if (!container) return;

        const subscribedUrls = new Set((this.settings.filterLists || []).map(l => l.url));

        container.innerHTML = SUBSCRIPTION_PRESETS.map(preset => {
            const isSubscribed = subscribedUrls.has(preset.url);
            const listData = isSubscribed ? (this.settings.filterLists.find(l => l.url === preset.url) || {}) : {};
            const isEnabled = listData.enabled || false;

            return `
                <div class="subscription-card">
                    <div class="subscription-card-header">
                        <h4>${preset.name}</h4>
                        <label class="switch">
                            <input type="checkbox" data-action="toggle-subscription" data-url="${preset.url}" ${isEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <p>${preset.description}</p>
                </div>
            `;
        }).join('');
    }
    
    renderCustomSubscriptions() {
        const tbody = document.getElementById('custom-subscriptions-tbody');
        const customSubscriptions = (this.settings.filterLists || []).filter(list => 
            !SUBSCRIPTION_PRESETS.some(preset => preset.url === list.url)
        );

        if (customSubscriptions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="no-rules-message">No custom subscriptions found.</td></tr>`;
            return;
        }

        tbody.innerHTML = customSubscriptions.map(list => {
            let statusHtml = '';
            const statusClass = (list.status || 'unknown').toLowerCase();
            
            if (statusClass === 'updating') {
                statusHtml = `<div class="status-spinner"></div> <span class="status-text updating">Updating...</span>`;
            } else {
                const dotClass = statusClass === 'success' ? 'success' : (statusClass === 'error' ? 'error' : 'unknown');
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
    
    async addSubscription() {
        const input = document.getElementById('add-subscription-input');
        const url = input.value.trim();
        if (!url) return;

        try {
            new URL(url); // Validate URL format
        } catch {
            this.showToast('Invalid URL format.', 'error');
            return;
        }
        
        const filterLists = this.settings.filterLists || [];
        if (filterLists.some(list => list.url === url)) {
            this.showToast('This subscription already exists.', 'error');
            return;
        }
        
        filterLists.push({ url, enabled: true, status: 'new' });
        await chrome.storage.sync.set({ filterLists });
        
        // Immediately trigger an update for the new list
        chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_SINGLE_LIST', url });
        
        input.value = '';
        this.showToast('Subscription added and is now updating!', 'success');
        this.render(); // Re-render immediately
    }

    async deleteSubscription(url) {
        if (!confirm(`Are you sure you want to delete this subscription?\n\n${url}`)) return;
        const filterLists = this.settings.filterLists.filter(list => list.url !== url);
        await chrome.storage.sync.set({ filterLists });
        this.showToast('Subscription removed.', 'success');
    }

    async toggleSubscription(url, isEnabled) {
        let filterLists = this.settings.filterLists || [];
        const existingList = filterLists.find(l => l.url === url);

        if (existingList) {
            existingList.enabled = isEnabled;
        } else if (isEnabled) {
             filterLists.push({ url, enabled: true, status: 'new' });
        }
        
        await chrome.storage.sync.set({ filterLists });

        if (isEnabled && (!existingList || existingList.status !== 'success')) {
            chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_SINGLE_LIST', url });
        }

        this.showToast('Subscription setting saved.', 'success');
        this.render();
    }
    
    async updateAllLists(button) {
        button.disabled = true;
        button.textContent = 'Updating...';
        await chrome.runtime.sendMessage({ type: 'FORCE_UPDATE_ALL_FILTER_LISTS' });
        this.showToast('Updating all subscriptions in the background.', 'success');
        // The button will re-enable on the next render after storage updates
    }


    async renderMalwareListStatus() {
        const container = document.getElementById('malware-list-status');
        if (!container) return;

        const { 'malware-list-cache': cache } = await chrome.storage.local.get('malware-list-cache');
        
        if (cache && cache.domains && cache.domains.length > 0) {
             container.innerHTML = `
                <div class="status-indicator">
                    <div class="status-dot success"></div>
                    <strong>Active</strong>
                </div>
                <div class="status-details">
                    <p>Last updated: <strong>${new Date(cache.lastUpdated).toLocaleString()}</strong></p>
                    <p>Blocking <strong>${cache.domains.length.toLocaleString()}</strong> malicious domains.</p>
                </div>
            `;
        } else {
             container.innerHTML = `
                <div class="status-indicator">
                    <div class="status-dot error"></div>
                    <strong>Inactive or Updating</strong>
                </div>
                <div class="status-details">
                    <p>The list will be fetched automatically in the background.</p>
                </div>
            `;
        }
    }


    // --- Generic Rule Rendering and Management ---
    renderRuleTable(tbodyId, countId, rules, type) {
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

    renderDefaultBlocklist() {
        const rules = this.settings.defaultBlocklist || [];
        const tbody = document.getElementById('default-blocklist-tbody');
        const countEl = document.getElementById('default-blocklist-count');
        
        if(countEl) countEl.textContent = `(${rules.length})`;
        if (!tbody) return;

        tbody.innerHTML = rules.map((rule, index) => `
            <tr>
                <td class="rule-value-cell" title="${rule.value}">${rule.value}</td>
                <td>
                    <label class="switch">
                        <input type="checkbox" data-action="toggle-rule" data-type="defaultBlocklist" data-index="${index}" ${rule.enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
            </tr>
        `).join('');
    }

    renderNetworkBlocklist() {
        this.renderRuleTable('network-blocklist-tbody', 'network-blocklist-count', this.settings.networkBlocklist, 'networkBlocklist');
    }
    
    renderHeuristicKeywords() {
        this.renderRuleTable('heuristic-keywords-tbody', 'heuristic-keywords-count', this.settings.heuristicKeywords, 'heuristicKeywords');
    }

    async addHeuristicKeyword() {
        const input = document.getElementById('add-heuristic-keyword-input');
        if (!input) return;

        const value = input.value.trim();
        if (!value) {
            this.showToast('Keyword cannot be empty.', 'error');
            return;
        }

        const type = 'heuristicKeywords';
        const rules = this.settings[type] || [];

        if (rules.some(rule => rule.value === value)) {
            this.showToast('This keyword already exists.', 'error');
            return;
        }

        rules.push({ value, enabled: true });
        await chrome.storage.sync.set({ [type]: rules });
        
        this.showToast('Heuristic keyword added!', 'success');
        input.value = '';
        // The storage listener will automatically re-render the table
    }

    renderCustomHidingRules() {
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

    async toggleRule(type, index, isEnabled) {
        if (!this.settings[type] || !this.settings[type][index]) return;
        this.settings[type][index].enabled = isEnabled;
        await chrome.storage.sync.set({ [type]: this.settings[type] });
        this.showToast('Rule setting saved!', 'success');
    }

    async deleteRule(type, index) {
        if (!this.settings[type] || !this.settings[type][index]) return;
        this.settings[type].splice(index, 1);
        await chrome.storage.sync.set({ [type]: this.settings[type] });
        this.showToast('Rule deleted!', 'success');
    }
    
    async deleteHidingDomain(type, domain) {
        if (!this.settings[type] || !this.settings[type][domain]) return;
        if (confirm(`Are you sure you want to delete all hiding rules for ${domain}?`)) {
            delete this.settings[type][domain];
            await chrome.storage.sync.set({ [type]: this.settings[type] });
            this.showToast(`Rules for ${domain} deleted!`, 'success');
        }
    }
}