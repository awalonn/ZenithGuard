// rule_engine.js
import { getURLCleanerRules } from './url_cleaner.js';
import { getMalwareRules } from './malware_protection.js';
import { getLatestYouTubeRules } from './youtube_rules_updater.js'; // IMPORT NEW GETTER

// --- Constants ---
export const HEURISTIC_RULE_ID_START = 100;
export const NETWORK_BLOCK_RULE_ID_START = 1000;
const YOUTUBE_AD_RULE_ID_START = 5000;
const ISOLATION_MODE_RULE_ID_START = 6000;
const URL_CLEANER_RULE_ID_START = 15000;
export const MALWARE_RULE_ID_START = 18000;
export const FILTER_LIST_RULE_ID_START = 20000;
const DEFAULT_BLOCKLIST_RULE_ID_START = 60000; // Increased from 30000 to prevent collisions with large filter lists
const REGEX_CHUNK_LIMIT = 128;
const KEYWORD_COUNT_LIMIT = 20;

// --- State ---
let isApplyingRules = false;

export function getRuleSource(ruleId) {
    if (ruleId >= DEFAULT_BLOCKLIST_RULE_ID_START) return 'Default Blocklist';
    if (ruleId >= FILTER_LIST_RULE_ID_START) return 'Filter List';
    if (ruleId >= MALWARE_RULE_ID_START) return 'Malware Protection';
    if (ruleId >= URL_CLEANER_RULE_ID_START) return 'URL Cleaner';
    if (ruleId >= ISOLATION_MODE_RULE_ID_START) return 'Isolation Mode';
    if (ruleId >= YOUTUBE_AD_RULE_ID_START) return 'YouTube Ads';
    if (ruleId >= NETWORK_BLOCK_RULE_ID_START) return 'Network Blocklist';
    if (ruleId >= HEURISTIC_RULE_ID_START) return 'Heuristic Engine';
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
        const { protectionPausedUntil } = await chrome.storage.session.get('protectionPausedUntil');
        const isPaused = protectionPausedUntil && protectionPausedUntil > Date.now();
        
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const removeRuleIds = existingRules.map(r => r.id);

        if (isPaused) {
            if (removeRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
                console.log('ZenithGuard: Protection paused. All rules disabled.');
            }
            return;
        }

        const MAX_DYNAMIC_RULES = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 5000;
        const RESERVED_RULES = 200; // For user rules, youtube, etc.
        let availableBudget = MAX_DYNAMIC_RULES - RESERVED_RULES;

        const settings = await chrome.storage.sync.get([
            'isHeuristicEngineEnabled', 'heuristicKeywords', 'heuristicAllowlist',
            'networkBlocklist', 'networkAllowlist', 'defaultBlocklist',
            'disabledSites', 'isUrlCleanerEnabled', 'isMalwareProtectionEnabled',
            'isolationModeSites', 'isYouTubeAdBlockingEnabled', 'filterLists'
        ]);
        const { sessionAllowlist = [] } = await chrome.storage.session.get('sessionAllowlist');

        const disabledForSite = settings.disabledSites || [];
        const enabledAllowlist = (settings.networkAllowlist || []).filter(r => r.enabled).map(r => r.value);
        const excludedDomains = [...new Set([...disabledForSite, ...enabledAllowlist, ...sessionAllowlist])];
        
        let addRules = [];

        // Gather small, high-priority rule sets first
        const highPriorityRulesets = [
            await getYouTubeAdBlockingRules(settings, excludedDomains),
            getIsolationModeRules(settings.isolationModeSites, excludedDomains),
            settings.isHeuristicEngineEnabled ? getHeuristicRules(settings.heuristicKeywords, settings.heuristicAllowlist, excludedDomains) : [],
            getDefaultBlockRules(settings.defaultBlocklist, excludedDomains),
            getNetworkBlockRules(settings.networkBlocklist, excludedDomains),
            settings.isUrlCleanerEnabled ? getURLCleanerRules(URL_CLEANER_RULE_ID_START, excludedDomains) : []
        ];

        for (const ruleset of highPriorityRulesets) {
            addRules.push(...ruleset);
        }

        availableBudget = Math.max(0, availableBudget - addRules.length);

        // Now, add the large, budget-constrained rule sets
        // 8. Malware Protection Rules (High priority for budget)
        if (settings.isMalwareProtectionEnabled && availableBudget > 0) {
            const malwareRules = await getMalwareRules(MALWARE_RULE_ID_START, excludedDomains, availableBudget);
            addRules.push(...malwareRules);
            availableBudget = Math.max(0, availableBudget - malwareRules.length);
        }

        // 9. Filter List Subscription Rules
        if (availableBudget > 0) {
            const filterListRules = await getFilterListRules(settings.filterLists, excludedDomains, availableBudget);
            addRules.push(...filterListRules);
        }


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

async function getFilterListRules(filterLists, excludedDomains, ruleBudget) {
    const allNetworkRules = new Set();
    const lists = filterLists || [];

    for (const list of lists) {
        if (list.status === 'success' && list.enabled) {
            const cacheKey = `filterlist-${list.url}`;
            const cached = await chrome.storage.local.get(cacheKey);
            if (cached[cacheKey] && cached[cacheKey].networkRules) {
                cached[cacheKey].networkRules.forEach(rule => allNetworkRules.add(rule));
            }
        }
    }

    if (allNetworkRules.size === 0) return [];

    const addRules = [];
    let ruleId = FILTER_LIST_RULE_ID_START;

    for (const urlFilter of allNetworkRules) {
        if (addRules.length >= ruleBudget) {
            console.warn(`ZenithGuard: Filter list rule budget (${ruleBudget}) reached. Some rules were not added.`);
            break;
        }
        if (urlFilter.length > 0) {
            addRules.push({
                id: ruleId++,
                priority: 3,
                action: { type: 'block' },
                condition: { 
                    urlFilter: urlFilter, 
                    resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket'],
                    excludedInitiatorDomains: excludedDomains.length > 0 ? excludedDomains : undefined
                }
            });
        }
    }
    return addRules;
}


function getIsolationModeRules(sites, excludedDomains) {
    if (!sites) return [];
    const excludedSet = new Set(excludedDomains);
    return sites
        .filter(site => site.enabled && !excludedSet.has(site.value))
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

function getHeuristicRules(keywords, allowlist, excludedDomains) {
    const rules = [];
    if (!keywords || keywords.length === 0) return rules;

    const enabledKeywords = keywords
        .filter(k => k.enabled)
        .map(k => escapeRegex(k.value));

    if (enabledKeywords.length === 0) return rules;

    const enabledAllowlistDomains = (allowlist || [])
        .filter(r => r.enabled)
        .map(r => r.value);
    
    const allExcludedInitiators = [...new Set([...enabledAllowlistDomains, ...excludedDomains])];

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
                    excludedInitiatorDomains: allExcludedInitiators.length > 0 ? allExcludedInitiators : undefined
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
                excludedInitiatorDomains: allExcludedInitiators.length > 0 ? allExcludedInitiators : undefined
            }
        });
    }

    return rules;
}

function getDefaultBlockRules(blocklist, excludedDomains) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => {
            const isRegex = item.value.startsWith('/') && (item.value.endsWith('/') || item.value.endsWith('/i'));
            
            const condition = isRegex 
                ? { regexFilter: item.value.slice(1, -1), resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'] }
                : { urlFilter: item.value, resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other'] };
            
            if (excludedDomains.length > 0) {
                condition.excludedInitiatorDomains = excludedDomains;
            }

            return {
                id: DEFAULT_BLOCKLIST_RULE_ID_START + index,
                priority: 2,
                action: { type: 'block' },
                condition: condition
            };
        });
}

function getNetworkBlockRules(blocklist, excludedDomains) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => ({
            id: NETWORK_BLOCK_RULE_ID_START + index,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter: `||${item.value}^`,
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other'],
                excludedInitiatorDomains: excludedDomains.length > 0 ? excludedDomains : undefined
            }
        }));
}

// UPGRADED: Now incorporates dynamic rules
async function getYouTubeAdBlockingRules(settings, excludedDomains) {
    if (!settings.isYouTubeAdBlockingEnabled) {
        return [];
    }
    const youtubeDomains = ['youtube.com', 'm.youtube.com', 'music.youtube.com'];
    if (youtubeDomains.some(d => excludedDomains.includes(d))) {
        return [];
    }

    // Hardcoded fallback rules
    let rules = [
        { id: YOUTUBE_AD_RULE_ID_START, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||youtube.com/api/stats/ads", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest"] }},
        { id: YOUTUBE_AD_RULE_ID_START + 1, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||googleads.g.doubleclick.net^", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest", "sub_frame", "script"] }},
        { id: YOUTUBE_AD_RULE_ID_START + 2, priority: 1, action: { "type": "block" }, condition: { "urlFilter": "||googlesyndication.com^", "initiatorDomains": youtubeDomains, "resourceTypes": ["xmlhttprequest", "sub_frame", "script"] }},
        { id: YOUTUBE_AD_RULE_ID_START + 3, priority: 1, action: { "type": "block" }, condition: { "regexFilter": "googlevideo\\.com/videoplayback.*(&adformat=|&prev_ad_id=)", "resourceTypes": ["xmlhttprequest", "media"] }}
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