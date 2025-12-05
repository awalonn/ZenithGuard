// rule_engine.js
import { getURLCleanerRules } from './url_cleaner.js';
import { getMalwareRules } from './malware_protection.js';
import { getLatestYouTubeRules } from './youtube_rules_updater.js';
import { BUNDLED_LISTS_PRESETS } from '../../settings/modules/subscription_presets.js';

// --- Constants ---
export const HEURISTIC_RULE_ID_START = 100;
export const NETWORK_BLOCK_RULE_ID_START = 1000;
const YOUTUBE_AD_RULE_ID_START = 5000;
const ISOLATION_MODE_RULE_ID_START = 6000;
const URL_CLEANER_RULE_ID_START = 15000;
export const MALWARE_RULE_ID_START = 18000;
export const FILTER_LIST_RULE_ID_START = 20000;
// REFACTORED: Pushed rule IDs up to make more space for allow rules
const ALLOW_RULE_ID_START = 60000;
const DEFAULT_BLOCKLIST_RULE_ID_START = 80000; // Pushed up

const REGEX_CHUNK_LIMIT = 128;
const KEYWORD_COUNT_LIMIT = 20;

// --- State ---
let isApplyingRules = false;

export function getRuleSource(ruleId) {
    if (ruleId >= DEFAULT_BLOCKLIST_RULE_ID_START) return 'Default Blocklist';
    if (ruleId >= ALLOW_RULE_ID_START) return 'User Allowlist'; // NEW
    if (ruleId >= FILTER_LIST_RULE_ID_START) return 'Filter List';
    if (ruleId >= MALWARE_RULE_ID_START) return 'Malware Protection';
    if (ruleId >= URL_CLEANER_RULE_ID_START) return 'URL Cleaner';
    if (ruleId >= ISOLATION_MODE_RULE_ID_START) return 'Isolation Mode';
    if (ruleId >= YOUTUBE_AD_RULE_ID_START) return 'YouTube Ads';
    if (ruleId >= NETWORK_BLOCK_RULE_ID_START) return 'Network Blocklist';
    if (ruleId >= HEURISTIC_RULE_ID_START) return 'Heuristic Engine';
    // Check for 0 is a fallback for static rules, which don't have debug info
    const staticRule = BUNDLED_LISTS_PRESETS.find(p => p.id === ruleId);
    if (staticRule) return staticRule.name;

    return 'Unknown';
}


function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function applyAllRules() {
    if (isApplyingRules) {
        console.log("ZenithGuard: Rule application already in progress.");
        return;
    }
    isApplyingRules = true;
    try {
        // --- Get Static & Dynamic Rules ---
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existingRules.map(r => r.id);

        // --- Get All Settings ---
        const settings = await chrome.storage.sync.get([
            'isHeuristicEngineEnabled', 'heuristicKeywords', 'heuristicAllowlist',
            'networkBlocklist', 'defaultBlocklist',
            'disabledSites', 'isUrlCleanerEnabled', 'isMalwareProtectionEnabled',
            'isolationModeSites', 'isYouTubeAdBlockingEnabled', 'filterLists',
            'enabledStaticRulesets',
            'isProtectionEnabled' // NEW: Get global on/off state
        ]);
        const { isProtectionEnabled = true } = settings; // Default to ON

        const { protectionPausedUntil } = await chrome.storage.session.get('protectionPausedUntil');
        const isPaused = protectionPausedUntil && protectionPausedUntil > Date.now();

        const allStaticRulesetIds = BUNDLED_LISTS_PRESETS.map(p => p.id);

        // --- REFACTORED: Check for GLOBAL OFF or PAUSE ---
        if (!isProtectionEnabled || isPaused) {
            // 1. Remove all dynamic rules
            if (removeRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
            }
            // 2. Disable all static rulesets
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: allStaticRulesetIds
            });

            if (isPaused) {
                console.log('ZenithGuard: Protection paused. All rules disabled.');
            } else {
                console.log('ZenithGuard: Protection globally disabled. All rules disabled.');
            }
            isApplyingRules = false; // Release lock before returning
            return; // Stop here
        }

        // --- If Not Paused or Disabled, Build All Rules ---
        let addRules = [];

        // --- 1. Re-enable Static Rulesets ---
        // (This runs on "Resume" or any other rules change)
        const enabledStaticIds = settings.enabledStaticRulesets || allStaticRulesetIds;
        await chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: enabledStaticIds,
            // Ensure any rules not in the enabled list are disabled
            disableRulesetIds: allStaticRulesetIds.filter(id => !enabledStaticIds.includes(id))
        });

        // --- 2. Build Per-Site "ALLOW" Rules (THE FIX) ---
        const disabledForSite = settings.disabledSites || [];
        if (disabledForSite.length > 0) {
            let allowRuleId = ALLOW_RULE_ID_START;
            const allowRules = [];

            for (const domain of disabledForSite) {
                // Rule 1: Whitelist requests *TO* this domain
                allowRules.push({
                    id: allowRuleId++,
                    // --- THIS IS THE FIX ---
                    priority: 5, // Must be higher than all block rules
                    // --- END FIX ---
                    action: { type: 'allow' },
                    condition: {
                        "requestDomains": [domain],
                        "resourceTypes": ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "media", "stylesheet", "other"]
                    }
                });
                // Rule 2: Whitelist requests *FROM* this domain
                allowRules.push({
                    id: allowRuleId++,
                    // --- THIS IS THE FIX ---
                    priority: 5, // Must be higher than all block rules
                    // --- END FIX ---
                    action: { type: 'allow' },
                    condition: {
                        "initiatorDomains": [domain],
                        "resourceTypes": ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "media", "stylesheet", "other"]
                    }
                });
            }
            addRules.push(...allowRules);
        }

        // --- 3. Build All "BLOCK" Rules ---
        const MAX_DYNAMIC_RULES = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 5000;
        let availableBudget = MAX_DYNAMIC_RULES - addRules.length;

        const highPriorityRulesets = [
            await getYouTubeAdBlockingRules(settings),
            getIsolationModeRules(settings.isolationModeSites),
            settings.isHeuristicEngineEnabled ? getHeuristicRules(settings.heuristicKeywords, settings.heuristicAllowlist) : [],
            getDefaultBlockRules(settings.defaultBlocklist),
            getNetworkBlockRules(settings.networkBlocklist),
            settings.isUrlCleanerEnabled ? getURLCleanerRules(URL_CLEANER_RULE_ID_START) : []
        ];

        for (const ruleset of highPriorityRulesets) {
            addRules.push(...ruleset);
        }

        availableBudget = Math.max(0, availableBudget - addRules.length);

        if (settings.isMalwareProtectionEnabled && availableBudget > 0) {
            const malwareRules = await getMalwareRules(MALWARE_RULE_ID_START, availableBudget);
            addRules.push(...malwareRules);
            availableBudget = Math.max(0, availableBudget - malwareRules.length);
        }

        if (availableBudget > 0) {
            const filterListRules = await getFilterListRules(settings.filterLists, availableBudget);
            addRules.push(...filterListRules);
        }

        // --- 4. Apply All Changes ---
        if (removeRuleIds.length > 0 || addRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: removeRuleIds,
                addRules: addRules
            });
        }
    } catch (e) {
        console.error("ZenithGuard: Failed to apply dynamic rules.", e);
    } finally {
        isApplyingRules = false;
    }
}

// REFACTORED: Removed excludedDomains
async function getFilterListRules(filterLists, ruleBudget) {
    const allNetworkRules = new Set();
    const lists = filterLists || [];

    // OPTIMIZATION: Filter enabled lists first
    const enabledLists = lists.filter(list => list.status === 'success' && list.enabled);

    if (enabledLists.length === 0) return [];

    // OPTIMIZATION: Batch storage retrieval
    const cacheKeys = enabledLists.map(list => `filterlist-${list.url}`);
    const cachedData = await chrome.storage.local.get(cacheKeys);

    for (const key of cacheKeys) {
        if (cachedData[key] && cachedData[key].networkRules) {
            cachedData[key].networkRules.forEach(rule => allNetworkRules.add(rule));
        }
    }

    if (allNetworkRules.size === 0) return [];

    const addRules = [];
    let ruleId = FILTER_LIST_RULE_ID_START;

    for (const urlFilter of allNetworkRules) {
        if (addRules.length >= ruleBudget) {
            console.warn(`ZenithGuard: *Custom* filter list rule budget (${ruleBudget}) reached. Some rules were not added.`);
            break;
        }
        if (urlFilter.length > 0) {
            addRules.push({
                id: ruleId++,
                priority: 3,
                action: { type: 'block' },
                condition: {
                    urlFilter: urlFilter,
                    resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket']
                    // excludedInitiatorDomains: REMOVED
                }
            });
        }
    }
    return addRules;
}


// REFACTORED: Removed excludedDomains
function getIsolationModeRules(sites) {
    if (!sites) return [];
    return sites
        // This rule should still apply even if a site is "disabled"
        .filter(site => site.enabled)
        .map((site, index) => ({
            id: ISOLATION_MODE_RULE_ID_START + index,
            priority: 1,
            action: { type: 'block' },
            condition: {
                initiatorDomains: [site.value],
                domainType: 'thirdParty',
                resourceTypes: ['script', 'object', 'sub_frame']
            }
        }));
}

// REFACTORED: Removed excludedDomains, merged allowlist
function getHeuristicRules(keywords, allowlist) {
    const rules = [];
    if (!keywords || keywords.length === 0) return rules;

    const enabledKeywords = keywords
        .filter(k => k.enabled)
        .map(k => escapeRegex(k.value));

    if (enabledKeywords.length === 0) return rules;

    const enabledAllowlistDomains = (allowlist || [])
        .filter(r => r.enabled)
        .map(r => r.value);

    const excludedInitiators = enabledAllowlistDomains.length > 0 ? enabledAllowlistDomains : undefined;


    let currentRegexParts = [];
    let currentRegexLength = 0;
    let ruleCounter = 0;

    for (const keyword of enabledKeywords) {
        if (keyword.length > REGEX_CHUNK_LIMIT) {
            console.warn(`ZenithGuard: Heuristic keyword starting with "${keyword.substring(0, 50)}..." is too long and will be skipped.`);
            continue;
        }

        const willExceedLength = currentRegexLength > 0 && (currentRegexLength + keyword.length + 1 > REGEX_CHUNK_LIMIT);
        const willExceedCount = currentRegexParts.length >= KEYWORD_COUNT_LIMIT;

        if (willExceedLength || willExceedCount) {
            rules.push({
                id: HEURISTIC_RULE_ID_START + ruleCounter++,
                priority: 2,
                action: { type: 'block' },
                condition: {
                    regexFilter: currentRegexParts.join('|'),
                    resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'],
                    excludedInitiatorDomains: excludedInitiators
                }
            });
            currentRegexParts = [keyword];
            currentRegexLength = keyword.length;
        } else {
            if (currentRegexLength > 0) currentRegexLength += 1; // for '|'
            currentRegexParts.push(keyword);
            currentRegexLength += keyword.length;
        }
    }

    if (currentRegexParts.length > 0) {
        rules.push({
            id: HEURISTIC_RULE_ID_START + ruleCounter,
            priority: 2,
            action: { type: 'block' },
            condition: {
                regexFilter: currentRegexParts.join('|'),
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'],
                excludedInitiatorDomains: excludedInitiators
            }
        });
    }

    return rules;
}

// REFACTORED: Removed excludedDomains
function getDefaultBlockRules(blocklist) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => {
            const isRegex = item.value.startsWith('/') && (item.value.endsWith('/') || item.value.endsWith('/i'));

            const condition = isRegex
                ? { regexFilter: item.value.slice(1, -1), resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'] }
                : { urlFilter: item.value, resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other'] };

            // excludedInitiatorDomains: REMOVED

            return {
                id: DEFAULT_BLOCKLIST_RULE_ID_START + index,
                priority: 2,
                action: { type: 'block' },
                condition: condition
            };
        });
}

// REFACTORED: Removed excludedDomains
function getNetworkBlockRules(blocklist) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => ({
            id: NETWORK_BLOCK_RULE_ID_START + index,
            priority: 1, // This is high priority for user rules
            action: { type: 'block' },
            condition: {
                urlFilter: `||${item.value}^`,
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other']
                // excludedInitiatorDomains: REMOVED
            }
        }));
}

// REFACTORED: Removed excludedDomains
async function getYouTubeAdBlockingRules(settings) {
    if (!settings.isYouTubeAdBlockingEnabled) {
        return [];
    }
    const youtubeDomains = ['youtube.com', 'm.youtube.com', 'music.youtube.com'];
    // excludedDomains check: REMOVED (will be handled by global "allow" rule)

    // Hardcoded fallback rules
    let rules = [
        { id: YOUTUBE_AD_RULE_ID_START, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||youtube.com/api/stats/ads", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest"] } },
        { id: YOUTUBE_AD_RULE_ID_START + 1, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||googleads.g.doubleclick.net^", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest", "sub_frame", "script"] } },
        { id: YOUTUBE_AD_RULE_ID_START + 2, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||googlesyndication.com^", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest", "sub_frame", "script"] } },
        { id: YOUTUBE_AD_RULE_ID_START + 3, priority: 1, action: { "type": "block" }, condition: { "regexFilter": "googlevideo\\.com/videoplayback.*(&adformat=|&prev_ad_id=)", "resourceTypes": ["xmlhttprequest", "media"] } }
    ];

    // Fetch and add dynamic rules
    const dynamicRules = await getLatestYouTubeRules();
    if (dynamicRules) {
        let ruleIdCounter = YOUTUBE_AD_RULE_ID_START + 100; // Start dynamic rules at a higher offset
        if (dynamicRules.regexFilters) {
            rules.push(...dynamicRules.regexFilters.map(regex => ({
                id: ruleIdCounter++,
                priority: 1,
                action: { type: 'block' },
                condition: { regexFilter: regex, initiatorDomains: youtubeDomains, resourceTypes: ["xmlhttprequest", "media", "script"] }
            })));
        }
        if (dynamicRules.urlFilters) {
            rules.push(...dynamicRules.urlFilters.map(urlFilter => ({
                id: ruleIdCounter++,
                priority: 1,
                action: { type: 'block' },
                condition: { urlFilter: urlFilter, initiatorDomains: youtubeDomains, resourceTypes: ["xmlhttprequest", "sub_frame", "script"] }
            })));
        }
    }

    return rules;
}