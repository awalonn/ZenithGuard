// filter_list_handler.js
import { applyAllRules } from './rule_engine.js';
// REFACTORED: Import bundled list metadata
import { BUNDLED_LISTS_PRESETS } from '../../settings/modules/subscription_presets.js';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Parses the raw text of a filter list into network and cosmetic rules.
 * This function was moved from the (now removed) offscreen document.
 * @param {string} text - The raw text content of the list.
 * @returns {object} An object containing networkRules (Array) and cosmeticRules (Object).
 */
function parseFilterList(text) {
    const networkRules = new Set();
    const cosmeticRules = {}; // { "domain.com": ["selector1", "selector2"], "": ["global_selector"] }
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // Ignore comments, blank lines, and metadata
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;

        if (trimmed.includes('##')) { // Cosmetic rule
            const parts = trimmed.split('##');
            const domains = parts[0].split(',').filter(d => d && !d.startsWith('~'));
            const selector = parts[1];

            if (domains.length > 0) {
                for (const domain of domains) {
                    if (!cosmeticRules[domain]) cosmeticRules[domain] = [];
                    cosmeticRules[domain].push(selector);
                }
            } else {
                // Global cosmetic rule (applies to all sites)
                if (!cosmeticRules['']) cosmeticRules[''] = [];
                cosmeticRules[''].push(selector);
            }
        } else { // Network rule
            if (trimmed.startsWith('@@')) continue; // Exception rules are not supported by this parser
            networkRules.add(trimmed);
        }
    }

    return { networkRules: Array.from(networkRules), cosmeticRules };
}


// --- Core Filter List Logic ---
/**
 * Updates all enabled *custom* filter lists, respecting cache duration.
 * Bundled static lists are updated with the extension.
 * @param {boolean} force - If true, bypasses the cache check and forces a download.
 */
export async function updateAllLists(force = false) {
    // REFACTORED: This function now *only* iterates over custom lists from storage
    const { filterLists = [] } = await chrome.storage.sync.get('filterLists');
    const updatePromises = [];
    for (const list of filterLists) {
        if (!list.enabled) continue;

        const cacheKey = `filterlist-${list.url}`;
        if (!force) {
            const cached = await chrome.storage.local.get(cacheKey);
            if (cached[cacheKey] && (Date.now() - cached[cacheKey].lastUpdated < CACHE_DURATION_MS)) {
                continue; // Skip update, cache is fresh
            }
        }
        updatePromises.push(updateList(list));
    }
    if (updatePromises.length > 0) {
        console.log(`ZenithGuard: Updating ${updatePromises.length} *custom* filter list(s)...`);
        await Promise.all(updatePromises);
        console.log("ZenithGuard: Custom filter list update complete.");
        // After updating, re-apply the rules to activate them directly
        await applyAllRules();
    }
}

/**
 * Fetches and parses a filter list directly in the service worker.
 * @param {object} list - The list object containing the URL.
 */
export async function updateList(list) {
    // This function remains largely the same, as it's what processes
    // the custom, user-added lists.
    const { filterLists = [] } = await chrome.storage.sync.get('filterLists');
    const findList = (l) => l.url === list.url;

    try {
        // Set status to "updating"
        const targetList = filterLists.find(findList);
        if (targetList) {
            targetList.status = 'updating';
            await chrome.storage.sync.set({ filterLists });
        }

        // REFACTORED: Fetch and parse directly in the service worker.
        // This makes the extension compatible with browsers that don't support the Offscreen API.
        const response = await fetch(list.url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) {
             throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const { networkRules, cosmeticRules } = parseFilterList(text);
        
        // If parsing failed, the function returns empty rule sets.
        // We can detect this and throw an error to mark the list as failed.
        if (networkRules.length === 0 && Object.keys(cosmeticRules).length === 0) {
            throw new Error("Parsing resulted in empty rule sets. The list might be unavailable or invalid.");
        }
        
        const cacheKey = `filterlist-${list.url}`;
        await chrome.storage.local.set({
            [cacheKey]: {
                networkRules: networkRules,
                cosmeticRules: cosmeticRules,
                lastUpdated: Date.now()
            }
        });
        
        // Update status to "success" in sync storage
        const currentFilterLists = (await chrome.storage.sync.get('filterLists')).filterLists || [];
        const updatedList = currentFilterLists.find(findList);
        if (updatedList) {
            updatedList.status = 'success';
            updatedList.ruleCount = networkRules.length + Object.values(cosmeticRules).reduce((acc, val) => acc + val.length, 0);
            updatedList.lastUpdated = Date.now();
            await chrome.storage.sync.set({ filterLists: currentFilterLists });
        }
    } catch (error) {
        console.error(`ZenithGuard: Failed to update filter list ${list.url}.`, error);
        // Update status to "error"
        const currentFilterLists = (await chrome.storage.sync.get('filterLists')).filterLists || [];
        const failedList = currentFilterLists.find(findList);
        if (failedList) {
            failedList.status = 'error';
            await chrome.storage.sync.set({ filterLists: currentFilterLists });
        }
    }
}

/**
 * Gets cosmetic hiding rules for a specific domain from all enabled filter lists.
 * REFACTORED: Now merges rules from *both* static bundled lists and dynamic custom lists.
 * @param {string} domain - The domain to get rules for.
 * @returns {Promise<Array>} An array of rule objects for the domain.
 */
export async function getHidingRulesForDomain(domain) {
    const { 
        filterLists = [], 
        isPerformanceModeEnabled,
        disabledSites = [] // --- THIS IS THE FIX ---
    } = await chrome.storage.sync.get([
        'filterLists', 'isPerformanceModeEnabled', 'disabledSites'
    ]);
    
    // --- THIS IS THE FIX ---
    // If performance mode is on OR the site is disabled, send no rules.
    if (isPerformanceModeEnabled || disabledSites.includes(domain)) {
        return { rules: [] };
    }
    // --- END FIX ---
    
    let allRulesForDomain = [];
    
    // 1. Get rules from enabled STATIC (bundled) lists
    try {
        const enabledStaticIds = await chrome.declarativeNetRequest.getEnabledRulesets();
        for (const preset of BUNDLED_LISTS_PRESETS) {
            if (enabledStaticIds.includes(preset.id)) {
                // Fetch the local cosmetic JSON file
                const url = chrome.runtime.getURL(preset.cosmeticRulesUrl);
                const response = await fetch(url);
                const cosmeticRules = await response.json();
                
                if (cosmeticRules) {
                    const matchingRules = (cosmeticRules[domain] || []).concat(cosmeticRules[''] || []);
                    allRulesForDomain.push(...matchingRules);
                }
            }
        }
    } catch (e) {
        console.error("ZenithGuard: Failed to load bundled cosmetic rules.", e);
    }

    // 2. Get rules from enabled CUSTOM (dynamic) lists
    const enabledCustomLists = (filterLists || []).filter(l => l.enabled && l.status === 'success');
    for (const list of enabledCustomLists) {
        const cacheKey = `filterlist-${list.url}`;
        const cached = await chrome.storage.local.get(cacheKey);
        const cosmeticRules = cached[cacheKey]?.cosmeticRules;

        if (cosmeticRules) {
            // Find rules for the specific domain or global rules (no domain specified)
            const matchingRules = (cosmeticRules[domain] || []).concat(cosmeticRules[''] || []);
            allRulesForDomain.push(...matchingRules);
        }
    }
    // Convert to the standard { value, enabled } format
    return { rules: allRulesForDomain.map(value => ({ value, enabled: true })) };
}