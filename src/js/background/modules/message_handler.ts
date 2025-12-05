import * as ruleEngine from './rule_engine.js';
import * as storageManager from './storage_manager.js';
import * as filterListHandler from './filter_list_handler.js';
import * as ai from './ai_handler.js';
import { updateMalwareList } from './malware_protection.js';
import { updateYouTubeRules } from './youtube_rules_updater.js';
import { updateTrackerList } from './tracker_list_updater.js';
import { generatePrivacyInsights } from './privacy_insights_engine.js';
import { getNetworkLogs, clearNetworkLogs } from './network_logger.js';

const lastAnalysisByTab = {};
const ANALYSIS_COOLDOWN_MS = 20_000;

// --- Debounce Utility ---
let applyRulesTimeout;
function debouncedApplyAllRules() {
    return new Promise((resolve) => {
        if (applyRulesTimeout) clearTimeout(applyRulesTimeout);
        applyRulesTimeout = setTimeout(async () => {
            await ruleEngine.applyAllRules();
            resolve();
        }, 500); // Wait 500ms for more changes
    });
}

export function initializeMessageHandler() {
    chrome.tabs.onRemoved.addListener((tabId) => {
        if (lastAnalysisByTab[tabId]) delete lastAnalysisByTab[tabId];
    });

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
            return true;
        }
        return false;
    });
}

const actions = {
    'TOGGLE_GLOBAL_PROTECTION': async (request) => {
        await chrome.storage.sync.set({ isProtectionEnabled: request.data.isEnabled });
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of tabs) { try { chrome.tabs.reload(tab.id); } catch (e) { } }
    },
    'APPLY_RULES_AND_RELOAD_TAB': async (request) => {
        // Debounce the rule application
        await debouncedApplyAllRules();
        try { chrome.tabs.reload(request.data.tabId); } catch (e) { }
    },
    'APPLY_ALL_RULES': () => debouncedApplyAllRules(),
    'ANALYZE_PAGE_WITH_AI': async (request) => {
        const { tabId, pageUrl } = request.data;
        if (lastAnalysisByTab[tabId] && (Date.now() - lastAnalysisByTab[tabId]) < ANALYSIS_COOLDOWN_MS) {
            return { error: `Please wait before re-running the analysis.` };
        }
        lastAnalysisByTab[tabId] = Date.now();
        const networkLog = getNetworkLogs(tabId);
        return ai.analyzePage(tabId, pageUrl, networkLog);
    },
    'HIDE_ELEMENT_WITH_AI': (request, sender) => ai.handleHideElementWithAI(request.data.description, { ...request.data.context, tabId: sender.tab.id }),
    'DEFEAT_ADBLOCK_WALL': async (request) => {
        const { tabId } = request.data;
        const onProgress = async (message) => {
            try { await chrome.tabs.sendMessage(tabId, { type: 'SHOW_PROCESSING_TOAST', message: message }); } catch (e) { }
        };
        try {
            const response = await ai.handleDefeatAdblockWall(tabId, onProgress);
            if (response.error) throw new Error(response.error);
            return response;
        } catch (error) {
            chrome.tabs.sendMessage(tabId, { type: 'SHOW_ERROR_TOAST', message: error.message }).catch(() => { });
            throw error;
        }
    },
    'HANDLE_COOKIE_CONSENT': (_, sender) => ai.handleCookieConsent(sender.tab.id),
    'SUMMARIZE_PRIVACY_POLICY': async (request) => {
        const { domain, policyUrl } = request.data;
        const key = `privacy-summary-${domain}`;
        try {
            const summary = await ai.handleSummarizePrivacyPolicy(policyUrl);
            if (summary.error) throw new Error(summary.error);
            await chrome.storage.local.set({ [key]: { summary, timestamp: Date.now() } });
        } catch (error) {
            await chrome.storage.local.set({ [key]: { error: error.message, timestamp: Date.now() } });
        }
    },
    'SELF_HEAL_RULE': (request, sender) => ai.handleSelfHealRule(request.data.selector, sender.tab.id, request.data.pageUrl),
    'GET_NETWORK_LOG': (request, sender) => getNetworkLogs(request.tabId || sender.tab.id),
    'CLEAR_NETWORK_LOG': (request) => { if (request.tabId) clearNetworkLogs(request.tabId); },
    'ADD_TO_NETWORK_BLOCKLIST': async (request) => {
        const { networkBlocklist = [] } = await chrome.storage.sync.get('networkBlocklist');
        const { domain } = request;
        if (domain && !networkBlocklist.some(r => r.value === domain)) {
            networkBlocklist.push({ value: domain, enabled: true });
            await chrome.storage.sync.set({ networkBlocklist });
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
    'GET_PRIVACY_INSIGHTS': (request) => generatePrivacyInsights(getNetworkLogs(request.tabId)),
    'GET_HIDING_RULES_FOR_DOMAIN': (request) => filterListHandler.getHidingRulesForDomain(request.domain),
    'PREVIEW_ELEMENT': async (request, sender) => {
        if (sender.tab && sender.tab.id) {
            try { await chrome.tabs.sendMessage(sender.tab.id, request); } catch (e) { }
        }
    },
    'CLEAR_PREVIEW': async (request, sender) => {
        if (sender.tab && sender.tab.id) {
            try { await chrome.tabs.sendMessage(sender.tab.id, request); } catch (e) { }
        }
    },
    'FOUND_PRIVACY_POLICY_URL': (request) => {
        chrome.storage.local.set({ [`privacy-policy-url-${request.data.domain}`]: request.data.policyUrl });
    },
    'RESET_SETTINGS_TO_DEFAULTS': async () => {
        await storageManager.resetSettingsToDefaults();
        return { success: true };
    },
    'FORCE_UPDATE_ALL_FILTER_LISTS': async () => {
        await Promise.all([
            filterListHandler.updateAllLists(true),
            updateMalwareList(true),
            updateYouTubeRules(true),
            updateTrackerList(true)
        ]);
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
    },
    'REAPPLY_HIDING_RULES': async () => {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: 'complete' });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'REAPPLY_HIDING_RULES' }).catch(() => { });
        });
    }
};
