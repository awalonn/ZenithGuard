import * as ruleEngine from './rule_engine.js';
import * as storageManager from './storage_manager.js';
import * as filterListHandler from './filter_list_handler.js';
import * as ai from './ai_handler.js';
import { updateMalwareList } from './malware_protection.js';
import { updateYouTubeRules } from './youtube_rules_updater.js';
import { updateTrackerList } from './tracker_list_updater.js';
import { generatePrivacyInsights } from './privacy_insights_engine.js';
import { getNetworkLogs, clearNetworkLogs } from './network_logger.js';
import * as focusMode from './focus_mode_manager.js';
// We should have privacyManager available or passed in. 
// Refactor: Pass privacyManager to initializeMessageHandler or export it from a singleton module.
// For now, let's assume we can access it via a module we create or simple variable if we can't easily export.
// Actually, background.ts imports message_handler. 
// A better pattern: message_handler exports 'registerHandlers(privacyManager)'?
// Or we moving privacy logic here?
// Let's rely on the PrivacyManager singleton pattern if possible, or simpler: 
// We will export a generic 'getPrivacyStats' helper in a new module if needed, 
// BUT simplest fix: Add handlers here that use the imported modules. 
// The issue is `privacyManager` instance is in `background.ts`.
// Solution: We will move the PrivacyManager instantiation to a separate module 'modules/privacy_service.ts' (singleton) or similar.
// For expediency: I will modify `background.ts` to export the instance, 
// BUT `background.ts` is the entry point, difficult to import from.
// Alternative: Instantiate PrivacyManager IN message_handler.ts? No, it needs webRequest listeners in background.
// COMPROMISE: I will let `background.ts` handle `GET_PRIVACY_STATS` directly as I planned before, 
// and ONLY add Focus Mode here which is stateless/module-based.
// Wait, `message_handler.ts` *consumes* all messages. If I don't add it here, it returns false.
// So I MUST add it here.
// I will create a `privacy_service.ts` to hold the singleton.


const lastAnalysisByTab: { [key: number]: number } = {};
const ANALYSIS_COOLDOWN_MS = 20_000;

// --- Debounce Utility ---
let applyRulesTimeout: any;
function debouncedApplyAllRules(): Promise<void> {
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

    chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        const handler = actions[request.type as keyof typeof actions];
        if (handler) {
            (async () => {
                try {
                    const response = await handler(request, sender);
                    sendResponse(response);
                } catch (error) {
                    const msg = (error as Error).message;
                    // Silence known operational errors
                    if (msg === 'QUOTA_EXCEEDED' || msg === 'TAB_CLOSED') {
                        console.warn(`ZenithGuard: Handled known error in ${request.type}:`, msg);
                    } else {
                        console.error(`Error handling message ${request.type}:`, error);
                    }
                    sendResponse({ error: msg });
                }
            })();
            return true;
        }
        return false;
    });
}

const actions = {
    'TOGGLE_GLOBAL_PROTECTION': async (request: any) => {
        await chrome.storage.sync.set({ isProtectionEnabled: request.data.isEnabled });
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of tabs) { try { if (tab.id) chrome.tabs.reload(tab.id); } catch (e) { } }
    },
    'APPLY_RULES_AND_RELOAD_TAB': async (request: any) => {
        // Debounce the rule application
        await debouncedApplyAllRules();
        try { if (request.data.tabId) chrome.tabs.reload(request.data.tabId); } catch (e) { }
    },
    'APPLY_ALL_RULES': () => debouncedApplyAllRules(),
    'ANALYZE_PAGE_WITH_AI': async (request: any) => {
        const { tabId, pageUrl } = request.data;
        if (lastAnalysisByTab[tabId] && (Date.now() - lastAnalysisByTab[tabId]) < ANALYSIS_COOLDOWN_MS) {
            return { error: `Please wait before re-running the analysis.` };
        }
        lastAnalysisByTab[tabId] = Date.now();
        const networkLog = getNetworkLogs(tabId);
        return ai.analyzePage(tabId, pageUrl, networkLog);
    },
    'HIDE_ELEMENT_WITH_AI': (request: any, sender: chrome.runtime.MessageSender) => {
        if (!sender.tab || !sender.tab.id) return;
        return ai.handleHideElementWithAI(request.data.description, { ...request.data.context, tabId: sender.tab.id });
    },
    'DEFEAT_ADBLOCK_WALL': async (request: any) => {
        const { tabId } = request.data;
        const onProgress = async (message: string) => {
            try { await chrome.tabs.sendMessage(tabId, { type: 'SHOW_PROCESSING_TOAST', message: message }); } catch (e) { }
        };
        try {
            const response = await ai.handleDefeatAdblockWall(tabId, onProgress);
            if (response.error) {
                return response;
            }

            // --- RELIABILITY FIX (v1.2.1) ---
            // Send message to content script directly from background
            // This ensures the fix is applied even if the popup is closed.
            if (response.selectors) {
                // BROADCAST TO ALL FRAMES (v1.2.4)
                // Adblock walls are often hidden inside iframes. We must send the command to EVERY frame.
                try {
                    const frames = await chrome.webNavigation.getAllFrames({ tabId });
                    if (frames) {
                        for (const frame of frames) {
                            chrome.tabs.sendMessage(tabId, {
                                type: 'EXECUTE_ADBLOCK_WALL_FIX',
                                selectors: response.selectors
                            }, { frameId: frame.frameId }).catch(() => { });
                        }
                        console.log(`ZenithGuard: Broadcasted wall-fix to ${frames.length} frames.`);
                    }
                } catch (e) {
                    // Fallback to top frame if webNavigation fails
                    chrome.tabs.sendMessage(tabId, {
                        type: 'EXECUTE_ADBLOCK_WALL_FIX',
                        selectors: response.selectors
                    }).catch(() => { });
                }

                // Persist the fix from background
                const tab = await chrome.tabs.get(tabId);
                if (tab && tab.url) {
                    const domain = new URL(tab.url).hostname;
                    const { persistentWallFixes = {} } = await chrome.storage.sync.get('persistentWallFixes') as any;
                    persistentWallFixes[domain] = {
                        overlaySelector: response.selectors.overlaySelector,
                        scrollSelector: response.selectors.scrollSelector,
                        enabled: true
                    };
                    await chrome.storage.sync.set({ persistentWallFixes });
                    console.log(`ZenithGuard: Persistent fix saved for ${domain} from background.`);
                }
            }

            return response;
        } catch (error) {
            // This catches unexpected errors that were not caught inside handleDefeatAdblockWall
            chrome.tabs.sendMessage(tabId, { type: 'SHOW_ERROR_TOAST', message: (error as Error).message }).catch(() => { });
            throw error;
        }
    },
    'HANDLE_COOKIE_CONSENT': (_: any, sender: chrome.runtime.MessageSender) => {
        if (!sender.tab || !sender.tab.id) return;
        return ai.handleCookieConsent(sender.tab.id);
    },
    'SUMMARIZE_PRIVACY_POLICY': async (request: any) => {
        const { domain, policyUrl } = request.data;
        const key = `privacy-summary-${domain}`;
        try {
            const summary = await ai.handleSummarizePrivacyPolicy(policyUrl);
            if (summary.error) throw new Error(summary.error);
            await chrome.storage.local.set({ [key]: { summary, timestamp: Date.now() } });
            return summary;
        } catch (error) {
            const errorMsg = (error as Error).message;
            await chrome.storage.local.set({ [key]: { error: errorMsg, timestamp: Date.now() } });
            return { error: errorMsg };
        }
    },
    'SELF_HEAL_RULE': (request: any, sender: chrome.runtime.MessageSender) => {
        if (!sender.tab || !sender.tab.id) return;
        return ai.handleSelfHealRule(request.data.selector, sender.tab.id, request.data.pageUrl);
    },
    'GET_NETWORK_LOG': (request: any, sender: chrome.runtime.MessageSender) => {
        const tabId = request.tabId || sender.tab?.id;
        if (!tabId) return [];
        return getNetworkLogs(tabId);
    },
    'CLEAR_NETWORK_LOG': (request: any) => { if (request.tabId) clearNetworkLogs(request.tabId); },
    'ADD_TO_NETWORK_BLOCKLIST': async (request: any) => {
        const { networkBlocklist = [] } = await chrome.storage.sync.get('networkBlocklist') as { networkBlocklist?: { value: string, enabled: boolean }[] };
        const { domain } = request;
        if (domain && !networkBlocklist.some(r => r.value === domain)) {
            networkBlocklist.push({ value: domain, enabled: true });
            await chrome.storage.sync.set({ networkBlocklist });
            return { success: true };
        }
        return { success: false, message: 'Rule already exists.' };
    },
    'BULK_ADD_RULES': async (request: any) => {
        const { networkBlocklist, customHidingRules } = request.data;
        const storage = await chrome.storage.sync.get(['networkBlocklist', 'customHidingRules']) as { networkBlocklist?: any[], customHidingRules?: Record<string, any[]> };
        const currentNetwork = new Set((storage.networkBlocklist || []).map((r: any) => r.value));
        networkBlocklist.forEach((domain: string) => currentNetwork.add(domain));
        const newNetworkRules = Array.from(currentNetwork).map(value => ({ value, enabled: true }));
        const currentHiding = storage.customHidingRules || {};
        const { domain, selectors } = customHidingRules;
        if (domain && selectors.length > 0) {
            const currentSelectors = new Set((currentHiding[domain] || []).map((r: any) => r.value));
            selectors.forEach((selector: string) => currentSelectors.add(selector));
            currentHiding[domain] = Array.from(currentSelectors).map(value => ({ value, enabled: true }));
        }
        await chrome.storage.sync.set({ networkBlocklist: newNetworkRules, customHidingRules: currentHiding });
        return { success: true };
    },
    'TEMPORARILY_ALLOW_DOMAIN': async (request: any) => {
        const { domain } = request;
        if (!domain) return;
        const { sessionAllowlist = [] } = await chrome.storage.session.get('sessionAllowlist') as { sessionAllowlist?: string[] };
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
    'GET_PRIVACY_INSIGHTS': (request: any) => {
        if (!request.tabId) return null;
        return generatePrivacyInsights(getNetworkLogs(request.tabId));
    },
    'START_FOCUS_MODE': async (request: any) => {
        await focusMode.startFocusMode(request.duration);
        await debouncedApplyAllRules(); // Re-apply to block sites
        return { success: true };
    },
    'STOP_FOCUS_MODE': async () => {
        await focusMode.stopFocusMode();
        await debouncedApplyAllRules(); // Re-apply to unblock sites
        return { success: true };
    },
    'GET_HIDING_RULES_FOR_DOMAIN': (request: any) => filterListHandler.getHidingRulesForDomain(request.domain),
    'PREVIEW_ELEMENT': async (request: any, sender: chrome.runtime.MessageSender) => {
        if (sender.tab && sender.tab.id) {
            try { await chrome.tabs.sendMessage(sender.tab.id, request); } catch (e) { }
        }
    },
    'CLEAR_PREVIEW': async (request: any, sender: chrome.runtime.MessageSender) => {
        if (sender.tab && sender.tab.id) {
            try { await chrome.tabs.sendMessage(sender.tab.id, request); } catch (e) { }
        }
    },
    'FOUND_PRIVACY_POLICY_URL': (request: any) => {
        chrome.storage.local.set({ [`privacy-policy-url-${request.data.domain}`]: request.data.policyUrl });
    },
    'RESET_SETTINGS_TO_DEFAULTS': async () => {
        await storageManager.resetSettingsToDefaults();
        return { success: true };
    },
    'FORCE_UPDATE_ALL_FILTER_LISTS': async () => {
        await Promise.all([
            filterListHandler.updateAllLists(true),
            updateMalwareList(),
            updateYouTubeRules(true),
            updateTrackerList(true)
        ]);
        return { success: true };
    },
    'FORCE_UPDATE_SINGLE_LIST': async (request: any) => {
        const { filterLists = [] } = await chrome.storage.sync.get('filterLists') as { filterLists?: { url: string }[] };
        const listToUpdate = filterLists.find((l: any) => l.url === request.url);
        if (listToUpdate) {
            // SAFE: Assuming listToUpdate conforms if found
            await filterListHandler.updateList(listToUpdate as any);
            await ruleEngine.applyAllRules();
        }
        return { success: true };
    },
    'REAPPLY_HIDING_RULES': async () => {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: 'complete' });
        tabs.forEach(tab => {
            if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'REAPPLY_HIDING_RULES' }).catch(() => { });
        });
    }
};
