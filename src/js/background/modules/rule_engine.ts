import { getURLCleanerRules } from './url_cleaner.js';
import { getMalwareRules } from './malware_protection.js';
import { getLatestYouTubeRules } from './youtube_rules_updater.js';
import { getFocusModeRules } from './focus_mode_manager.js';
import { BUNDLED_LISTS_PRESETS } from '../../settings/modules/subscription_presets.js';
import { AppSettings, FilterList } from '../../types.js';

// --- Constants ---
export const HEURISTIC_RULE_ID_START = 100;
export const NETWORK_BLOCK_RULE_ID_START = 1000;
const YOUTUBE_AD_RULE_ID_START = 5000;
const ISOLATION_MODE_RULE_ID_START = 6000;
const FOCUS_MODE_RULE_ID_START = 7000;
const URL_CLEANER_RULE_ID_START = 15000;
export const MALWARE_RULE_ID_START = 18000;
export const FILTER_LIST_RULE_ID_START = 20000;
// REFACTORED: Pushed rule IDs up to make more space for allow rules
const ALLOW_RULE_ID_START = 60000;
const DEFAULT_BLOCKLIST_RULE_ID_START = 80000; // Pushed up

// Reduced limits to prevent "2KB memory limit" errors (Error 101)
const REGEX_CHUNK_LIMIT = 90; // Decreased from 128
const KEYWORD_COUNT_LIMIT = 8; // Decreased from 20

// --- State ---
let isApplyingRules = false;

export function getRuleSource(ruleId: number) {
    if (ruleId >= DEFAULT_BLOCKLIST_RULE_ID_START) return 'Default Blocklist';
    if (ruleId >= ALLOW_RULE_ID_START) return 'User Allowlist'; // NEW
    if (ruleId >= FILTER_LIST_RULE_ID_START) return 'Filter List';
    if (ruleId >= MALWARE_RULE_ID_START) return 'Malware Protection';
    if (ruleId >= URL_CLEANER_RULE_ID_START) return 'URL Cleaner';
    if (ruleId >= FOCUS_MODE_RULE_ID_START) return 'Focus Mode';
    if (ruleId >= ISOLATION_MODE_RULE_ID_START) return 'Isolation Mode';
    if (ruleId >= YOUTUBE_AD_RULE_ID_START) return 'YouTube Ads';
    if (ruleId >= NETWORK_BLOCK_RULE_ID_START) return 'Network Blocklist';
    if (ruleId >= HEURISTIC_RULE_ID_START) return 'Heuristic Engine';
    // Check for 0 is a fallback for static rules, which don't have debug info
    const staticRule = BUNDLED_LISTS_PRESETS.find(p => p.id === String(ruleId));
    if (staticRule) return staticRule.name;

    return 'Unknown';
}


function escapeRegex(str: string) {
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
            'isProtectionEnabled'
        ]) as AppSettings;
        const { isProtectionEnabled = true } = settings;

        const { protectionPausedUntil } = await chrome.storage.session.get('protectionPausedUntil') as { protectionPausedUntil?: number };
        const isPaused = protectionPausedUntil && protectionPausedUntil > Date.now();

        // Define All Native Ruleset IDs (matches manifest.json)
        const NATIVE_RULESETS = ['easylist', 'easyprivacy', 'annoyances', 'youtube'];

        // --- REFACTORED: Check for GLOBAL OFF or PAUSE ---
        if (!isProtectionEnabled || isPaused) {
            // 1. Remove all dynamic rules
            if (removeRuleIds.length > 0) {
                await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
            }
            // 2. Disable all static rulesets
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: NATIVE_RULESETS
            });

            if (isPaused) {
                console.log('ZenithGuard: Protection paused. All rules disabled.');
            } else {
                console.log('ZenithGuard: Protection globally disabled. All rules disabled.');
            }
            isApplyingRules = false;
            return;
        }

        // --- 1. Manage Native Rulesets (DNR) ---
        // Determine which static rulesets should be enabled based on settings
        const rulesetsToEnable = new Set<string>();

        // Map user's "filterLists" to native ruleset IDs
        // Note: In v2.0 we simplify. If "EasyList" is checked in UI, we enable 'easylist' ruleset.
        // We fallback to checking if the ID exists in enabledStaticRulesets from the UI.

        const enabledIds = new Set(settings.enabledStaticRulesets || []);

        // Logic: The UI sends IDs like '1' (EasyList), '2' (EasyPrivacy), '3' (Annoyances).
        // specific mapping:
        // '1' -> easylist
        // '2' -> easyprivacy
        // '3' -> annoyances

        // We also check settings.isYouTubeAdBlockingEnabled
        if (settings.isYouTubeAdBlockingEnabled) {
            rulesetsToEnable.add('youtube');
        }

        // Logic to enable standard lists if their ID is in the enabled set or if we default to on
        // For ZenithGuard 2.0, we can assume standard lists are enabled if not explicitly disabled or if the user selected them.
        // The most robust way is to check the BUNDLED_LISTS_PRESETS logic or simply trust enabledStaticRulesets.
        // Let's iterate the manifest presets:
        if (enabledIds.has('easylist') || enabledIds.size === 0) rulesetsToEnable.add('easylist');      // Default ON
        if (enabledIds.has('easyprivacy') || enabledIds.size === 0) rulesetsToEnable.add('easyprivacy');   // Default ON
        if (enabledIds.has('annoyances') || enabledIds.has('ublock_annoyances') || enabledIds.size === 0) rulesetsToEnable.add('annoyances');    // Default ON (New in 2.0)

        const enableList = Array.from(rulesetsToEnable);
        const disableList = NATIVE_RULESETS.filter(id => !rulesetsToEnable.has(id));

        await chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: enableList,
            disableRulesetIds: disableList
        });

        // --- 2. Build Dynamic Rules (User Customizations Only) ---
        let addRules: chrome.declarativeNetRequest.Rule[] = [];

        // Build Allow Rules first
        const disabledForSite = (settings.disabledSites as string[]) || [];
        if (disabledForSite.length > 0) {
            let allowRuleId = ALLOW_RULE_ID_START;
            const allowRules: chrome.declarativeNetRequest.Rule[] = [];
            for (const domain of disabledForSite) {
                allowRules.push({
                    id: allowRuleId++,
                    priority: 99,
                    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
                    condition: { "requestDomains": [domain], "resourceTypes": ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "media", "stylesheet", "other"] as chrome.declarativeNetRequest.ResourceType[] }
                });
                allowRules.push({
                    id: allowRuleId++,
                    priority: 99,
                    action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
                    condition: { "initiatorDomains": [domain], "resourceTypes": ["main_frame", "sub_frame", "script", "xmlhttprequest", "image", "media", "stylesheet", "other"] as chrome.declarativeNetRequest.ResourceType[] }
                });
            }
            addRules.push(...allowRules);
        }

        // Build Custom Block Rules
        const MAX_DYNAMIC_RULES = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 5000;
        let availableBudget = MAX_DYNAMIC_RULES - addRules.length;

        const customRulesets = [
            getIsolationModeRules(settings.isolationModeSites),
            await getFocusModeRules(),
            settings.isHeuristicEngineEnabled ? getHeuristicRules(settings.heuristicKeywords, settings.heuristicAllowlist || []) : [],
            getDefaultBlockRules(settings.defaultBlocklist),
            getNetworkBlockRules(settings.networkBlocklist),
            settings.isUrlCleanerEnabled ? getURLCleanerRules(URL_CLEANER_RULE_ID_START, []) : []
        ];

        for (const ruleset of customRulesets) {
            if (availableBudget <= 0) break;
            const chunk = ruleset.slice(0, availableBudget);
            addRules.push(...chunk);
            availableBudget -= chunk.length;
        }

        if (settings.isMalwareProtectionEnabled && availableBudget > 0) {
            const malwareRules = await getMalwareRules(MALWARE_RULE_ID_START, [], availableBudget);
            addRules.push(...malwareRules);
        }

        // --- 3. Apply Dynamic Changes ---
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

function getIsolationModeRules(sites: any[]) {
    if (!sites) return [];
    return sites
        .filter(site => site.enabled)
        .map((site, index) => ({
            id: ISOLATION_MODE_RULE_ID_START + index,
            priority: 1,
            action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
            condition: {
                initiatorDomains: [site.value],
                domainType: 'thirdParty' as chrome.declarativeNetRequest.DomainType,
                resourceTypes: ['script', 'object', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[]
            }
        }));
}

function getHeuristicRules(keywords: any[], allowlist: any[]) {
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    if (!keywords || keywords.length === 0) return rules;

    const enabledKeywords = keywords
        .filter(k => k.enabled)
        .map(k => escapeRegex(k.value));

    if (enabledKeywords.length === 0) return rules;

    const enabledAllowlistDomains = (allowlist || [])
        .filter(r => r.enabled)
        .map(r => r.value);

    const excludedInitiators = enabledAllowlistDomains.length > 0 ? enabledAllowlistDomains : undefined;

    let currentRegexParts: string[] = [];
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
            const regexStr = currentRegexParts.join('|');
            rules.push({
                id: HEURISTIC_RULE_ID_START + ruleCounter++,
                priority: 2,
                action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
                condition: {
                    regexFilter: regexStr,
                    resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'] as chrome.declarativeNetRequest.ResourceType[],
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
            action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
            condition: {
                regexFilter: currentRegexParts.join('|'),
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'] as chrome.declarativeNetRequest.ResourceType[],
                excludedInitiatorDomains: excludedInitiators
            }
        });
    }

    return rules;
}

function getDefaultBlockRules(blocklist: any[]) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => {
            const isRegex = item.value.startsWith('/') && (item.value.endsWith('/') || item.value.endsWith('/i'));

            const condition = isRegex
                ? { regexFilter: item.value.slice(1, -1), resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest'] as chrome.declarativeNetRequest.ResourceType[] }
                : { urlFilter: item.value, resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other'] as chrome.declarativeNetRequest.ResourceType[] };

            return {
                id: DEFAULT_BLOCKLIST_RULE_ID_START + index,
                priority: 2,
                action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
                condition: condition
            };
        });
}

function getNetworkBlockRules(blocklist: any[]) {
    if (!blocklist) return [];
    return blocklist
        .filter(item => item.enabled)
        .map((item, index) => ({
            id: NETWORK_BLOCK_RULE_ID_START + index,
            priority: 1, // This is high priority for user rules
            action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
            condition: {
                urlFilter: `||${item.value}^`,
                resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'image', 'media', 'websocket', 'other'] as chrome.declarativeNetRequest.ResourceType[]
            }
        }));
}