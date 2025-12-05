import * as ruleEngine from './modules/rule_engine.js';
import * as storageManager from './modules/storage_manager.js';
import * as filterListHandler from './modules/filter_list_handler.js';
import * as ai from './modules/ai_handler.js';
import { updateMalwareList } from './modules/malware_protection.js';
import { updateYouTubeRules } from './modules/youtube_rules_updater.js';
import { updateTrackerList } from './modules/tracker_list_updater.js';
import { initializeNetworkLogger } from './modules/network_logger.js';
import { createContextMenus, initializeContextMenuListeners } from './modules/context_menu_manager.js';
import { initializeTabManager, injectContentScripts } from './modules/tab_manager.js';
import { initializeMessageHandler } from './modules/message_handler.js';

// Initialize Modules
initializeNetworkLogger();
initializeContextMenuListeners();
initializeTabManager();
initializeMessageHandler();

chrome.runtime.onInstalled.addListener(async (details) => {
    await storageManager.initializeSettingsIfNeeded();
    if (details.reason === 'install') chrome.tabs.create({ url: 'src/pages/welcome.html' });
    else if (details.reason === 'update') {
        const currentVersion = chrome.runtime.getManifest().version;
        if (details.previousVersion !== currentVersion) chrome.tabs.create({ url: `src/pages/whats_new.html?v=${currentVersion}` });
    }
    createContextMenus();
    await storageManager.migrateOldRules();
    await ruleEngine.applyAllRules();
    await filterListHandler.updateAllLists(true);
    await updateMalwareList();
    await updateYouTubeRules(true);
    await updateTrackerList(true);
    chrome.alarms.create('dailyListUpdate', { periodInMinutes: 24 * 60 });
});

chrome.runtime.onStartup.addListener(async () => {
    await storageManager.initializeSettingsIfNeeded();
    await ruleEngine.applyAllRules();
    await filterListHandler.updateAllLists();
    await updateMalwareList();
    await updateYouTubeRules();
    await updateTrackerList();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    if (changes.geminiApiKey) ai.resetAiClient();

    const ruleKeys = [
        'networkBlocklist', 'customHidingRules', 'heuristicKeywords',
        'defaultBlocklist', 'disabledSites', 'isolationModeSites',
        'filterLists', 'isHeuristicEngineEnabled', 'isUrlCleanerEnabled',
        'isMalwareProtectionEnabled', 'isYouTubeAdBlockingEnabled',
        'isProtectionEnabled', 'enabledStaticRulesets', 'forgetfulSites'
    ];

    if (ruleKeys.some(key => changes[key])) {
        console.log("ZenithGuard: Rule-related setting changed. Re-applying all rules.");
        await ruleEngine.applyAllRules();
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: 'complete' });
        const messagePromises = tabs.map(tab => {
            if (tab.id) return chrome.tabs.sendMessage(tab.id, { type: 'REAPPLY_HIDING_RULES' }).catch(e => { });
            return Promise.resolve();
        });
        await Promise.allSettled(messagePromises);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyListUpdate') {
        await filterListHandler.updateAllLists();
        await updateMalwareList();
        await updateYouTubeRules();
        await updateTrackerList();
    }
    if (alarm.name === 'resumeProtection') {
        await chrome.storage.session.remove('protectionPausedUntil');
        await ruleEngine.applyAllRules();
        await chrome.alarms.clear('resumeProtection');
    }
});

// --- Keyboard Shortcuts Handler ---
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-settings') {
        chrome.runtime.openOptionsPage();
    } else if (command === 'open-logger') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTabId = tabs[0]?.id;
        // If we have a current tab, pass its ID so the logger can filter for it
        const url = currentTabId ? `src/pages/logger.html?tabId=${currentTabId}` : 'src/pages/logger.html';
        chrome.tabs.create({ url });
    } else if (command === 'toggle-zapper') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].id) {
            try {
                await chrome.tabs.sendMessage(tabs[0].id, { type: 'START_ZAPPER_MODE' });
            } catch (e) {
                console.warn("ZenithGuard: Could not toggle Zapper on this tab. Content script may not be loaded.", e);
            }
        }
    }
});