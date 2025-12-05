// filter_list_handler.ts
import { applyAllRules } from './rule_engine.js';
import { BUNDLED_LISTS_PRESETS } from '../../settings/modules/subscription_presets.js';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FilterList {
    id?: number | string;
    url: string;
    enabled: boolean;
    name?: string;
    lastUpdated?: number;
    ruleCount?: number;
    status?: 'success' | 'error' | 'updating' | 'idle';
}

interface CosmeticRules {
    [domain: string]: string[];
}

interface FilterListCache {
    networkRules: string[];
    cosmeticRules: CosmeticRules;
    lastUpdated: number;
}

interface ParsedRules {
    networkRules: string[];
    cosmeticRules: CosmeticRules;
}

/**
 * Parses the raw text of a filter list into network and cosmetic rules.
 */
function parseFilterList(text: string): ParsedRules {
    const networkRules = new Set<string>();
    const cosmeticRules: CosmeticRules = {};
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;

        if (trimmed.includes('##')) { // Cosmetic rule
            const parts = trimmed.split('##');
            const domainPart = parts[0];
            const selector = parts[1];

            const domains = domainPart.split(',').filter(d => d && !d.startsWith('~'));

            if (domains.length > 0) {
                for (const domain of domains) {
                    if (!cosmeticRules[domain]) cosmeticRules[domain] = [];
                    cosmeticRules[domain].push(selector);
                }
            } else {
                // Global cosmetic rule
                if (!cosmeticRules['']) cosmeticRules[''] = [];
                cosmeticRules[''].push(selector);
            }
        } else { // Network rule
            if (trimmed.startsWith('@@')) continue;
            networkRules.add(trimmed);
        }
    }

    return { networkRules: Array.from(networkRules), cosmeticRules };
}

export async function updateAllLists(force = false): Promise<void> {
    const { filterLists = [] } = await chrome.storage.sync.get('filterLists') as { filterLists?: FilterList[] };
    const updatePromises: Promise<void>[] = [];

    for (const list of filterLists) {
        if (!list.enabled) continue;

        const cacheKey = `filterlist-${list.url}`;
        if (!force) {
            const cached = await chrome.storage.local.get(cacheKey) as Record<string, FilterListCache>;
            if (cached[cacheKey] && (Date.now() - cached[cacheKey].lastUpdated < CACHE_DURATION_MS)) {
                continue;
            }
        }
        updatePromises.push(updateList(list));
    }
    if (updatePromises.length > 0) {
        console.log(`ZenithGuard: Updating ${updatePromises.length} *custom* filter list(s)...`);
        await Promise.all(updatePromises);
        console.log("ZenithGuard: Custom filter list update complete.");
        await applyAllRules();
    }
}

export async function updateList(list: FilterList): Promise<void> {
    const { filterLists = [] } = await chrome.storage.sync.get('filterLists') as { filterLists?: FilterList[] };
    const findList = (l: FilterList) => l.url === list.url;

    try {
        const targetList = filterLists.find(findList);
        if (targetList) {
            targetList.status = 'updating';
            await chrome.storage.sync.set({ filterLists });
        }

        const response = await fetch(list.url, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const { networkRules, cosmeticRules } = parseFilterList(text);

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

        const currentData = await chrome.storage.sync.get('filterLists') as { filterLists?: FilterList[] };
        const currentFilterLists = currentData.filterLists || [];
        const updatedList = currentFilterLists.find(findList);

        if (updatedList) {
            updatedList.status = 'success';
            updatedList.ruleCount = networkRules.length + Object.values(cosmeticRules).reduce((acc, val) => acc + val.length, 0);
            updatedList.lastUpdated = Date.now();
            await chrome.storage.sync.set({ filterLists: currentFilterLists });
        }
    } catch (error) {
        console.error(`ZenithGuard: Failed to update filter list ${list.url}.`, error);
        const currentData = await chrome.storage.sync.get('filterLists') as { filterLists?: FilterList[] };
        const currentFilterLists = currentData.filterLists || [];
        const failedList = currentFilterLists.find(findList);
        if (failedList) {
            failedList.status = 'error';
            await chrome.storage.sync.set({ filterLists: currentFilterLists });
        }
    }
}

export async function getHidingRulesForDomain(domain: string): Promise<{ rules: { value: string, enabled: boolean }[] }> {
    const {
        filterLists = [],
        isPerformanceModeEnabled,
        disabledSites = []
    } = await chrome.storage.sync.get([
        'filterLists', 'isPerformanceModeEnabled', 'disabledSites'
    ]) as { filterLists?: FilterList[], isPerformanceModeEnabled?: boolean, disabledSites?: string[] };

    if (isPerformanceModeEnabled || disabledSites.includes(domain)) {
        return { rules: [] };
    }

    let allRulesForDomain: string[] = [];

    // 1. Get rules from enabled STATIC (bundled) lists
    try {
        const enabledStaticIds = await chrome.declarativeNetRequest.getEnabledRulesets();
        for (const preset of BUNDLED_LISTS_PRESETS) {
            if (enabledStaticIds.includes(preset.id)) {
                const url = chrome.runtime.getURL(preset.cosmeticRulesUrl);
                const response = await fetch(url);
                const cosmeticRules = await response.json() as CosmeticRules;

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
        const cached = await chrome.storage.local.get(cacheKey) as Record<string, FilterListCache>;
        const cosmeticRules = cached[cacheKey]?.cosmeticRules;

        if (cosmeticRules) {
            const matchingRules = (cosmeticRules[domain] || []).concat(cosmeticRules[''] || []);
            allRulesForDomain.push(...matchingRules);
        }
    }

    return { rules: allRulesForDomain.map(value => ({ value, enabled: true })) };
}