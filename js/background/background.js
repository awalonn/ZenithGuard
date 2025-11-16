// background.js - Service Worker

import * as ruleEngine from './modules/rule_engine.js';
import * as storageManager from './modules/storage_manager.js';
import * as filterListHandler from './modules/filter_list_handler.js';
import * as ai from './modules/ai_handler.js';
import { updateMalwareList } from './modules/malware_protection.js';
import { BREACHED_DOMAINS, isDomainBreached } from './modules/breach_checker.js';
import { generatePrivacyInsights } from './modules/privacy_insights_engine.js';
import { updateYouTubeRules } from './modules/youtube_rules_updater.js';
import { HEURISTIC_KEYWORDS } from './heuristic_rules.js';
import { DEFAULT_BLOCKLIST } from './modules/default_rules.js';

const networkLogs = {};
const MAX_LOG_ENTRIES_PER_TAB = 200;
const lastAnalysisByTab = {};
const ANALYSIS_COOLDOWN_MS = 20_000;

// --- NEW HELPER FUNCTION ---
async function initializeSettingsIfNeeded() {
    const { settingsInitialized } = await chrome.storage.sync.get('settingsInitialized');
    if (settingsInitialized) {
        return; // Settings are already in place
    }

    console.log("ZenithGuard: First run or settings missing. Initializing default settings.");
    await chrome.storage.sync.set({
        // General Settings Toggles
        isHeuristicEngineEnabled: true,
        isUrlCleanerEnabled: true,
        isMalwareProtectionEnabled: true,
        isYouTubeAdBlockingEnabled: true,
        isSandboxedIframeEnabled: true,
        isCookieBannerHidingEnabled: true,
        isSelfHealingEnabled: true,
        isPerformanceModeEnabled: false,
        isBreachWarningEnabled: true,
        theme: 'dark',
        
        // Default Subscriptions
        filterLists: [{ url: "https://easylist.to/easylist/easylist.txt", enabled: true, status: 'new' }],

        // Default Rule Lists
        defaultBlocklist: DEFAULT_BLOCKLIST.map(r => ({ value: r.value, enabled: r.enabled })),
        heuristicKeywords: HEURISTIC_KEYWORDS.map(kw => ({ value: kw, enabled: true })),
        networkBlocklist: [],
        customHidingRules: {},
        heuristicAllowlist: [],
        isolationModeSites: [],

        // Marker to prevent re-initialization
        settingsInitialized: true
    });
}


// --- Context Menus ---
function setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'zenithguard-quick-hide',
            title: "ZenithGuard: Quick Hide Element",
            contexts: ['all']
        });
        chrome.contextMenus.create({
            id: 'zenithguard-ai-hide-targeted',
            title: "ZenithGuard: Hide with AI...",
            contexts: ['all']
        });
    });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const messageType = {
        'zenithguard-quick-hide': 'QUICK_HIDE_ELEMENT',
        'zenithguard-ai-hide-targeted': 'START_AI_HIDING_TARGETED'
    }[info.menuItemId];
    
    if (messageType && tab.id) {
        if (messageType === 'START_AI_HIDING_TARGETED') {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['js/content/ai_hider.js']
                });
            } catch (e) {
                console.error("ZenithGuard: Failed to inject AI Hider script.", e);
                return; 
            }
        }
        chrome.tabs.sendMessage(tab.id, { type: messageType });
    }
});


// --- Installation & Startup ---
chrome.runtime.onInstalled.addListener(async (details) => {
    await initializeSettingsIfNeeded(); // Ensure settings are present on install/update

    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'pages/onboarding.html' });
    } else if (details.reason === 'update') {
        const currentVersion = chrome.runtime.getManifest().version;
        if (details.previousVersion !== currentVersion) {
            chrome.tabs.create({ url: `pages/whats_new.html?v=${currentVersion}` });
        }
    }
    setupContextMenus();
    await storageManager.migrateOldRules();
    await ruleEngine.applyAllRules();
    await filterListHandler.updateAllLists(true);
    await updateMalwareList();
    await updateYouTubeRules(true);
    chrome.alarms.create('dailyListUpdate', { periodInMinutes: 24 * 60 });

    // Inject into existing tabs on install/update
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        injectContentScripts(tab.id, tab.url);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    await initializeSettingsIfNeeded(); // Ensure settings are present on browser startup
    await ruleEngine.applyAllRules();
    await filterListHandler.updateAllLists();
    await updateMalwareList();
    await updateYouTubeRules();

    // Inject into existing tabs on startup
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        injectContentScripts(tab.id, tab.url);
    }
});

// --- Alarms & Tab Management ---
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return; // We only care about sync storage for rules

    // Handle API Key change separately for clarity
    if (changes.geminiApiKey) {
        console.log("ZenithGuard: API Key changed. Resetting AI client.");
        ai.resetAiClient();
    }

    // Check if any of the rule-related storage keys have changed
    const ruleKeys = [
        'networkBlocklist', 'customHidingRules', 'heuristicKeywords', 
        'defaultBlocklist', 'disabledSites', 'isolationModeSites', 
        'filterLists', 'isHeuristicEngineEnabled', 'isUrlCleanerEnabled',
        'isMalwareProtectionEnabled', 'isYouTubeAdBlockingEnabled'
    ];

    const needsRuleUpdate = ruleKeys.some(key => changes[key]);

    if (needsRuleUpdate) {
        console.log("ZenithGuard: Rule-related setting changed. Re-applying all rules.");
        await ruleEngine.applyAllRules(); // This handles network rules

        // Now, notify all active content scripts to re-apply cosmetic rules
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: 'complete' });
        
        const messagePromises = tabs.map(tab =>
            chrome.tabs.sendMessage(tab.id, { type: 'REAPPLY_HIDING_RULES' }).catch(e => {
                // This catch is for individual promise rejections. We only log unexpected errors.
                if (!String(e.message).includes('Could not establish connection') && !String(e.message).includes('Receiving end does not exist')) {
                    console.warn(`ZenithGuard: Could not send rule-update message to tab ${tab.id}:`, e.message);
                }
            })
        );
        
        // Wait for all messages to be sent, ignoring individual failures.
        await Promise.allSettled(messagePromises);

        console.log("ZenithGuard: Notified content scripts to update cosmetic filtering.");
    }
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyListUpdate') {
        await filterListHandler.updateAllLists();
        await updateMalwareList();
        await updateYouTubeRules();
    }
    if (alarm.name === 'resumeProtection') {
        await chrome.storage.session.remove('protectionPausedUntil');
        await ruleEngine.applyAllRules();
        await chrome.alarms.clear('resumeProtection');
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (networkLogs[tabId]) delete networkLogs[tabId];
    if (lastAnalysisByTab[tabId]) delete lastAnalysisByTab[tabId]; // NEW
});

// REFACTORED: Now includes Breach Warning logic
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        injectContentScripts(tabId, tab.url);
    }
    
    // NEW: Centralized Data Breach Check
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        const { isBreachWarningEnabled } = await chrome.storage.sync.get('isBreachWarningEnabled');
        if (isBreachWarningEnabled) {
            const hostname = new URL(tab.url).hostname;
            if (isDomainBreached(hostname, BREACHED_DOMAINS)) {
                try {
                    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_BREACH_WARNING', domain: hostname });
                } catch (e) {
                    // This can happen if the content script is not yet ready, which is fine.
                    if (!String(e.message).includes('Could not establish connection') && !String(e.message).includes('Receiving end does not exist')) {
                        console.warn(`ZenithGuard: Could not send breach warning to tab ${tabId}:`, e.message);
                    }
                }
            }
        }
    }
});


async function injectContentScripts(tabId, tabUrl) {
    if (!tabUrl || !tabUrl.startsWith('http')) {
        return; // Only inject into http/https pages
    }

    const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
    const hostname = new URL(tabUrl).hostname;
    if (disabledSites.includes(hostname)) {
        return; // Don't inject on disabled sites
    }

    try {
        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ['css/theme.css'],
        });
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['js/content/selector_generator.js', 'js/content/content.js'],
        });
    } catch (err) {
        // Gracefully handle errors for pages where injection is forbidden
        if (
            !String(err.message).includes('Cannot access a chrome:') &&
            !String(err.message).includes('The extensions gallery cannot be scripted') &&
            !String(err.message).includes('No tab with id') &&
            !String(err.message).includes('Receiving end does not exist')
        ) {
            console.debug(`ZenithGuard: Failed to inject scripts into tab ${tabId} (${tabUrl}). Error: ${err.message}`);
        }
    }
}


// --- Network Logging ---
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) networkLogs[details.tabId] = [];
});

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
    const { request, rule } = info;
    if (networkLogs[request.tabId]) {
        const logEntry = networkLogs[request.tabId].find(entry => entry.url === request.url && !entry.statusUpdated);
        if (logEntry) {
            logEntry.status = 'blocked';
            logEntry.matchedRuleInfo = { ruleId: rule.ruleId, source: ruleEngine.getRuleSource(rule.ruleId) };
            logEntry.statusUpdated = true;
        }
    }
});

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!networkLogs[details.tabId]) networkLogs[details.tabId] = [];
        const existingEntry = networkLogs[details.tabId].find(entry => entry.url === details.url);
        if (!existingEntry) {
            // Memory leak prevention: Cap the number of log entries
            if (networkLogs[details.tabId].length >= MAX_LOG_ENTRIES_PER_TAB) {
                networkLogs[details.tabId].shift(); // Remove the oldest entry
            }
            networkLogs[details.tabId].push({
                url: details.url,
                type: details.type,
                initiator: details.initiator,
                timestamp: details.timeStamp,
                status: 'allowed'
            });
        }
    },
    { urls: ['<all_urls>'] }
);

// --- Message Handling ---
const actions = {
    'TOGGLE_SITE_PROTECTION': async (request) => {
        const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
        const { domain } = request.data;
        const newDisabledSites = disabledSites.includes(domain) ? disabledSites.filter(d => d !== domain) : [...disabledSites, domain];
        await chrome.storage.sync.set({ disabledSites: newDisabledSites });
        await ruleEngine.applyAllRules();
        chrome.tabs.reload(request.data.tabId);
    },
    'APPLY_ALL_RULES': () => ruleEngine.applyAllRules(),
    'ANALYZE_PAGE_WITH_AI': async (request) => {
        const { tabId, pageUrl } = request.data;
        const now = Date.now();

        if (lastAnalysisByTab[tabId] && (now - lastAnalysisByTab[tabId]) < ANALYSIS_COOLDOWN_MS) {
            const remaining = Math.ceil((ANALYSIS_COOLDOWN_MS - (now - lastAnalysisByTab[tabId])) / 1000);
            return { error: `Please wait ${remaining} seconds before re-running the analysis.` };
        }
        lastAnalysisByTab[tabId] = now;
        
        const networkLog = networkLogs[tabId] || [];
        return ai.analyzePage(tabId, pageUrl, networkLog);
    },
    'HIDE_ELEMENT_WITH_AI': (request, sender) => ai.handleHideElementWithAI(request.data.description, { ...request.data.context, tabId: sender.tab.id }),
    'DEFEAT_ADBLOCK_WALL': async (request) => {
        const { tabId } = request.data;

        // Define the progress callback function
        const onProgress = async (message) => {
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: 'SHOW_PROCESSING_TOAST',
                    message: message
                });
            } catch (e) {
                // Suppress errors if content script isn't there, but log others.
                if (!String(e.message).includes('Could not establish connection')) {
                    console.warn("ZenithGuard: Could not send progress update.", e);
                }
            }
        };

        try {
            // Pass the callback to the AI handler
            const response = await ai.handleDefeatAdblockWall(tabId, onProgress);
            if (response.error) throw new Error(response.error);
            return response;
        } catch (error) {
            // Notify the content script of the failure
            chrome.tabs.sendMessage(tabId, {
                type: 'SHOW_ERROR_TOAST',
                message: error.message
            }).catch(() => {});
            // Re-throw the error to be caught by the popup's message handler
            throw error;
        }
    },
    'HANDLE_COOKIE_CONSENT': (_, sender) => ai.handleCookieConsent(sender.tab.id),
    'SUMMARIZE_PRIVACY_POLICY': async (request) => {
        const { domain, policyUrl } = request.data;
        const key = `privacy-summary-${domain}`;
        try {
            const summary = await ai.handleSummarizePrivacyPolicy(policyUrl);
            await chrome.storage.local.set({ [key]: { summary, timestamp: Date.now() } });
        } catch (error) {
            await chrome.storage.local.set({ [key]: { error: error.message, timestamp: Date.now() } });
        }
    },
    'SELF_HEAL_RULE': (request, sender) => ai.handleSelfHealRule(request.data.selector, sender.tab.id, request.data.pageUrl),
    'GET_NETWORK_LOG': (request, sender) => networkLogs[request.tabId || sender.tab.id] || [],
    'CLEAR_NETWORK_LOG': (request) => { if (request.tabId) networkLogs[request.tabId] = []; },
    'ADD_TO_NETWORK_BLOCKLIST': async (request) => {
        const { networkBlocklist = [] } = await chrome.storage.sync.get('networkBlocklist');
        const { domain } = request;
        if (domain && !networkBlocklist.some(r => r.value === domain)) {
            networkBlocklist.push({ value: domain, enabled: true });
            await chrome.storage.sync.set({ networkBlocklist });
            await ruleEngine.applyAllRules();
            return { success: true };
        }
        return { success: false, message: 'Rule already exists.' };
    },
    'BULK_ADD_RULES': async (request) => {
        const { networkBlocklist, customHidingRules } = request.data;
        const storage = await chrome.storage.sync.get(['networkBlocklist', 'customHidingRules']);
        const currentNetwork = new Set((storage.networkBlocklist || []).map(r => r.value));
        networkBlocklist.forEach(domain => currentNetwork.add(domain));
        const newNetworkRules = Array.from(currentNetwork).map(value => ({ value, enabled: true }));
        const currentHiding = storage.customHidingRules || {};
        const { domain, selectors } = customHidingRules;
        if (domain && selectors.length > 0) {
            const currentSelectors = new Set((currentHiding[domain] || []).map(r => r.value));
            selectors.forEach(selector => currentSelectors.add(selector));
            currentHiding[domain] = Array.from(currentSelectors).map(value => ({ value, enabled: true }));
        }
        await chrome.storage.sync.set({ networkBlocklist: newNetworkRules, customHidingRules: currentHiding });
        await ruleEngine.applyAllRules();
        return { success: true };
    },
    'TEMPORARILY_ALLOW_DOMAIN': async (request) => {
        const { domain } = request;
        if (!domain) return;
        const { sessionAllowlist = [] } = await chrome.storage.session.get('sessionAllowlist');
        if (!sessionAllowlist.includes(domain)) {
            await chrome.storage.session.set({ sessionAllowlist: [...sessionAllowlist, domain] });
            await ruleEngine.applyAllRules();
        }
    },
    'PAUSE_PROTECTION': async () => {
        const pauseUntil = Date.now() + (15 * 60 * 1000);
        await chrome.storage.session.set({ protectionPausedUntil: pauseUntil });
        await chrome.alarms.create('resumeProtection', { delayInMinutes: 15 });
        await ruleEngine.applyAllRules();
        return { success: true, pauseUntil };
    },
    'RESUME_PROTECTION': async () => {
        await chrome.storage.session.remove('protectionPausedUntil');
        await chrome.alarms.clear('resumeProtection');
        await ruleEngine.applyAllRules();
        return { success: true };
    },
    'GET_PRIVACY_INSIGHTS': (request) => generatePrivacyInsights(networkLogs[request.tabId] || []),
    'GET_HIDING_RULES_FOR_DOMAIN': (request) => filterListHandler.getHidingRulesForDomain(request.domain),
    'PREVIEW_ELEMENT': async (request, sender) => {
        if (sender.tab && sender.tab.id) {
            try {
                await chrome.tabs.sendMessage(sender.tab.id, request);
            } catch (e) {
                // Suppress "Receiving end does not exist" errors, which are expected
                // if the content script is not ready.
                if (!e.message.includes('Could not establish connection')) {
                    console.error("Error relaying PREVIEW_ELEMENT message:", e);
                }
            }
        }
    },
    'CLEAR_PREVIEW': async (request, sender) => {
        if (sender.tab && sender.tab.id) {
            try {
                await chrome.tabs.sendMessage(sender.tab.id, request);
            } catch (e) {
                if (!e.message.includes('Could not establish connection')) {
                    console.error("Error relaying CLEAR_PREVIEW message:", e);
                }
            }
        }
    },
    'FOUND_PRIVACY_POLICY_URL': (request) => {
        chrome.storage.local.set({ [`privacy-policy-url-${request.data.domain}`]: request.data.policyUrl });
    },
    'RESET_SETTINGS_TO_DEFAULTS': async () => {
        await storageManager.resetSettingsToDefaults();
        await ruleEngine.applyAllRules();
        return { success: true };
    },
    'FORCE_UPDATE_ALL_FILTER_LISTS': async () => {
        await filterListHandler.updateAllLists(true);
        return { success: true };
    },
    'FORCE_UPDATE_SINGLE_LIST': async (request) => {
        const { filterLists = [] } = await chrome.storage.sync.get('filterLists');
        const listToUpdate = filterLists.find(l => l.url === request.url);
        if (listToUpdate) {
            await filterListHandler.updateList(listToUpdate);
            await ruleEngine.applyAllRules();
        }
        return { success: true };
    }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = actions[request.type];
    if (handler) {
        (async () => {
            try {
                const response = await handler(request, sender);
                sendResponse(response);
            } catch (error) {
                console.error(`Error handling message ${request.type}:`, error);
                sendResponse({ error: error.message });
            }
        })();
        return true; // Indicates async response
    }
    return false;
});