// storage_manager.js
import { HEURISTIC_KEYWORDS } from '../heuristic_rules.js';
import { DEFAULT_BLOCKLIST } from './default_rules.js';

// Convert simple string arrays for rules into the new { value, enabled } object format.
export async function migrateOldRules() {
    const keysToMigrate = ['networkBlocklist', 'heuristicKeywords', 'heuristicAllowlist', 'isolationModeSites', 'forgetfulSites'];
    const storage = await chrome.storage.sync.get(keysToMigrate);
    let needsUpdate = false;
    
    for (const key of keysToMigrate) {
        if (storage[key] && Array.isArray(storage[key]) && storage[key].length > 0 && typeof storage[key][0] === 'string') {
            console.log(`ZenithGuard: Migrating old rule format for "${key}"...`);
            storage[key] = storage[key].map(value => ({ value: value, enabled: true }));
            needsUpdate = true;
        }
    }
    
    const { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules');
    let hidingRulesNeedUpdate = false;
    for (const domain in customHidingRules) {
        if (Array.isArray(customHidingRules[domain]) && customHidingRules[domain].length > 0 && typeof customHidingRules[domain][0] === 'string') {
            customHidingRules[domain] = customHidingRules[domain].map(value => ({ value, enabled: true }));
            hidingRulesNeedUpdate = true;
        }
    }
    
    const operations = [];
    if (needsUpdate) {
        operations.push(chrome.storage.sync.set(storage));
    }
    if (hidingRulesNeedUpdate) {
         operations.push(chrome.storage.sync.set({ customHidingRules }));
    }
    if (operations.length > 0) {
        await Promise.all(operations);
        console.log("ZenithGuard: Rule migration complete.");
    }
}

export async function resetSettingsToDefaults() {
    await chrome.storage.sync.set({
        defaultBlocklist: DEFAULT_BLOCKLIST.map(r => ({ value: r.value, enabled: r.enabled })),
        heuristicKeywords: HEURISTIC_KEYWORDS.map(kw => ({ value: kw, enabled: true })),
        networkBlocklist: [],
        customHidingRules: {},
        heuristicAllowlist: [],
        isolationModeSites: []
    });
}