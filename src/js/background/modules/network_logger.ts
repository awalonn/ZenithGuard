import * as ruleEngine from './rule_engine.js';
import { updateDailyStats } from './storage_manager.js';

interface MatchedRuleInfo {
    ruleId: number;
    source: string;
}

interface LogEntry {
    url: string;
    type: string; // strict type relaxed to string to match chrome definitions compatibility
    initiator?: string;
    timestamp: number;
    status: 'allowed' | 'blocked';
    matchedRuleInfo?: MatchedRuleInfo;
    statusUpdated?: boolean;
}

// Map tabId (number) to array of logs
const networkLogs: Record<number, LogEntry[]> = {};
const MAX_LOG_ENTRIES_PER_TAB = 200;

export function initializeNetworkLogger() {
    chrome.webNavigation.onCommitted.addListener((details) => {
        if (details.frameId === 0) networkLogs[details.tabId] = [];
    });

    if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
        chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
            const { request, rule } = info;
            if (networkLogs[request.tabId]) {
                let sourceName = ruleEngine.getRuleSource(rule.ruleId);
                if (rule.rulesetId) sourceName = 'Static Filter List';

                // Find allowed request to update it to blocked
                const logEntry = networkLogs[request.tabId].find(entry => entry.url === request.url && !entry.statusUpdated);

                if (logEntry) {
                    logEntry.status = 'blocked';
                    logEntry.matchedRuleInfo = { ruleId: rule.ruleId, source: sourceName };
                    logEntry.statusUpdated = true;
                }
            }

            // Update Daily Stats
            let type: 'tracker' | 'ad' = 'tracker'; // Default

            if (rule.rulesetId) {
                if (rule.rulesetId === 'easylist' || rule.rulesetId === 'ublock_annoyances') {
                    type = 'ad';
                } else if (rule.rulesetId === 'easyprivacy') {
                    type = 'tracker';
                }
            } else if (rule.ruleId) {
                // Use constants from rule_engine
                if (rule.ruleId >= ruleEngine.MALWARE_RULE_ID_START && rule.ruleId < ruleEngine.FILTER_LIST_RULE_ID_START) {
                    type = 'tracker'; // Malware treated as tracker/security threat
                } else if (rule.ruleId >= ruleEngine.FILTER_LIST_RULE_ID_START && rule.ruleId < 60000) { // ALLOW_RULE_ID_START
                    // Custom filter lists - assume tracker or ad? 
                    // Hard to know without analyzing the list. Default to tracker.
                    type = 'tracker';
                } else if (rule.ruleId >= 5000 && rule.ruleId < 6000) { // YOUTUBE_AD_RULE_ID_START
                    type = 'ad';
                }
            }

            // Simple heuristic fallback
            if (request.url.match(/ad|banner|doubleclick|pagead/i)) {
                type = 'ad';
            }

            updateDailyStats(type, request.type);
        });
    }

    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            if (!networkLogs[details.tabId]) networkLogs[details.tabId] = [];

            // Check if entry already exists to avoid duplicates
            const existingEntry = networkLogs[details.tabId].find(entry => entry.url === details.url);

            if (!existingEntry) {
                if (networkLogs[details.tabId].length >= MAX_LOG_ENTRIES_PER_TAB) networkLogs[details.tabId].shift();
                networkLogs[details.tabId].push({
                    url: details.url,
                    type: details.type,
                    initiator: details.initiator,
                    timestamp: details.timeStamp,
                    status: 'allowed'
                });
            }
            return undefined;
        }, { urls: ['<all_urls>'] }
    );

    chrome.tabs.onRemoved.addListener((tabId) => {
        if (networkLogs[tabId]) delete networkLogs[tabId];
    });
}

export function getNetworkLogs(tabId: number): LogEntry[] {
    return networkLogs[tabId] || [];
}

export function clearNetworkLogs(tabId: number): void {
    if (tabId) networkLogs[tabId] = [];
}

export function removeNetworkLog(tabId: number): void {
    if (networkLogs[tabId]) delete networkLogs[tabId];
}
