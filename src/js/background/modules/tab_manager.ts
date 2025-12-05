import { BREACHED_DOMAINS, isDomainBreached } from './breach_checker.js';

const closedTabsCache = {};

export function initializeTabManager() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId && tab.url && tab.url.startsWith('http')) closedTabsCache[tabId] = tab.url;
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
        const url = closedTabsCache[tabId];
        if (!url) { delete closedTabsCache[tabId]; return; }

        try {
            const { forgetfulSites = [] } = await chrome.storage.sync.get('forgetfulSites');
            const enabledForgetfulSites = (forgetfulSites || []).filter(s => s.enabled).map(s => s.value);
            if (enabledForgetfulSites.length === 0) { delete closedTabsCache[tabId]; return; }

            const closedDomain = new URL(url).hostname;
            if (enabledForgetfulSites.includes(closedDomain)) {
                console.log(`ZenithGuard: Forgetful Browsing is clearing data for ${closedDomain}`);
                const origin = new URL(url).origin;
                await chrome.browsingData.remove({ origins: [origin] }, { cache: true, cookies: true, localStorage: true, sessionStorage: true });
            }
        } catch (e) { console.warn(`ZenithGuard: Error during Forgetful Browsing cleanup for ${url}:`, e.message); }
        finally { delete closedTabsCache[tabId]; }
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
            const { isBreachWarningEnabled } = await chrome.storage.sync.get('isBreachWarningEnabled');
            if (isBreachWarningEnabled) {
                const hostname = new URL(tab.url).hostname;
                if (isDomainBreached(hostname, BREACHED_DOMAINS)) {
                    chrome.tabs.sendMessage(tabId, { type: 'SHOW_BREACH_WARNING', domain: hostname }).catch(e => { });
                }
            }
        }
    });
}

export async function injectContentScripts(tabId, tabUrl) {
    // Deprecated: Content scripts are now injected via manifest.json
    return;
}
