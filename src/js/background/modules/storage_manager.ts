// storage_manager.js
import { HEURISTIC_KEYWORDS } from '../heuristic_rules.js';
import { DEFAULT_BLOCKLIST } from './default_rules.js';

// Convert simple string arrays for rules into the new { value, enabled } object format.
export async function migrateOldRules() {
    const keysToMigrate = ['networkBlocklist', 'heuristicKeywords', 'heuristicAllowlist', 'isolationModeSites', 'forgetfulSites'];
    const storage = await chrome.storage.sync.get(keysToMigrate);
    let needsUpdate = false;

    for (const key of keysToMigrate) {
        if (storage[key] && Array.isArray(storage[key]) && storage[key].length > 0 && typeof storage[key][0] === 'string') {
            console.log(`ZenithGuard: Migrating old rule format for "${key}"...`);
            storage[key] = storage[key].map(value => ({ value: value, enabled: true }));
            needsUpdate = true;
        }
    }

    const { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules');
    let hidingRulesNeedUpdate = false;
    for (const domain in customHidingRules) {
        if (Array.isArray(customHidingRules[domain]) && customHidingRules[domain].length > 0 && typeof customHidingRules[domain][0] === 'string') {
            customHidingRules[domain] = customHidingRules[domain].map(value => ({ value, enabled: true }));
            hidingRulesNeedUpdate = true;
        }
    }

    const operations = [];
    if (needsUpdate) {
        operations.push(chrome.storage.sync.set(storage));
    }
    if (hidingRulesNeedUpdate) {
        operations.push(chrome.storage.sync.set({ customHidingRules }));
    }
    // --- NEW: Migrate Placeholder URLs ---
    const urlSettings = await chrome.storage.sync.get(['trackerListUrl', 'youtubeRulesUrl']);
    let urlsNeedUpdate = false;

    if (urlSettings.trackerListUrl && urlSettings.trackerListUrl.includes('YOUR_USERNAME')) {
        urlSettings.trackerListUrl = 'https://gist.githubusercontent.com/awalonn/6d72d652200fe4aa16fd7cba3c47e573/raw/c39c25acc9ca31f99f1ae6dbc792024263b5e2c7/trackers.json';
        urlsNeedUpdate = true;
    }

    if (urlSettings.youtubeRulesUrl && urlSettings.youtubeRulesUrl.includes('YOUR_USERNAME')) {
        urlSettings.youtubeRulesUrl = 'https://gist.githubusercontent.com/awalonn/446737a854b3b3016b6b4ab9bd35e32b/raw/29c7e5c4bdb9b8f3381f14d585005fde328725d4/youtube_rules.json';
        urlsNeedUpdate = true;
    }

    if (urlsNeedUpdate) {
        operations.push(chrome.storage.sync.set(urlSettings));
    }

    if (operations.length > 0) {
        await Promise.all(operations);
        console.log("ZenithGuard: Rule migration complete.");
    }
}

export async function resetSettingsToDefaults() {
    await chrome.storage.sync.set({
        defaultBlocklist: DEFAULT_BLOCKLIST.map(r => ({ value: r.value, enabled: r.enabled })),
        heuristicKeywords: HEURISTIC_KEYWORDS.map(kw => ({ value: kw, enabled: true })),
        networkBlocklist: [],
        customHidingRules: {},
        heuristicAllowlist: [],
        isolationModeSites: [],
        // Reset remote URLs to defaults
        youtubeRulesUrl: 'https://gist.githubusercontent.com/awalonn/446737a854b3b3016b6b4ab9bd35e32b/raw/29c7e5c4bdb9b8f3381f14d585005fde328725d4/youtube_rules.json',
        trackerListUrl: 'https://gist.githubusercontent.com/awalonn/6d72d652200fe4aa16fd7cba3c47e573/raw/c39c25acc9ca31f99f1ae6dbc792024263b5e2c7/trackers.json'
    });
}

export async function initializeSettingsIfNeeded() {
    const { settingsInitialized } = await chrome.storage.sync.get('settingsInitialized');
    if (settingsInitialized) return;

    console.log("ZenithGuard: First run or settings missing. Initializing default settings.");
    await chrome.storage.sync.set({
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
        isProtectionEnabled: true,
        filterLists: [{ url: "https://easylist.to/easylist/easylist.txt", enabled: true, status: 'new' }],
        defaultBlocklist: DEFAULT_BLOCKLIST.map(r => ({ value: r.value, enabled: r.enabled })),
        heuristicKeywords: HEURISTIC_KEYWORDS.map(kw => ({ value: kw, enabled: true })),
        networkBlocklist: [],
        customHidingRules: {},
        heuristicAllowlist: [],
        isolationModeSites: [],
        forgetfulSites: [],
        // NEW: Configurable remote URLs for dynamic rule updates
        youtubeRulesUrl: 'https://gist.githubusercontent.com/awalonn/446737a854b3b3016b6b4ab9bd35e32b/raw/29c7e5c4bdb9b8f3381f14d585005fde328725d4/youtube_rules.json',
        trackerListUrl: 'https://gist.githubusercontent.com/awalonn/6d72d652200fe4aa16fd7cba3c47e573/raw/c39c25acc9ca31f99f1ae6dbc792024263b5e2c7/trackers.json',
        settingsInitialized: true
    });
}

export async function updateDailyStats(type, resourceType) {
    const today = new Date().toISOString().slice(0, 10);
    const { dailyBlocks = {}, dailyPerformance = {} } = await chrome.storage.local.get(['dailyBlocks', 'dailyPerformance']);

    // --- Update Block Counts ---
    if (!dailyBlocks[today]) {
        dailyBlocks[today] = { ads: 0, trackers: 0 };
    }

    if (type === 'ad') {
        dailyBlocks[today].ads = (dailyBlocks[today].ads || 0) + 1;
    } else if (type === 'tracker') {
        dailyBlocks[today].trackers = (dailyBlocks[today].trackers || 0) + 1;
    }

    // --- Update Performance Stats (Estimated Saved Bytes) ---
    if (!dailyPerformance[today]) {
        dailyPerformance[today] = { totalWeight: 0, blockedWeight: 0 };
    }

    // Estimated weights in KB
    const weights = {
        'image': 150,
        'media': 1500,
        'script': 50,
        'sub_frame': 300,
        'xmlhttprequest': 10,
        'websocket': 5,
        'font': 30,
        'stylesheet': 20,
        'other': 10
    };

    const estimatedBytes = (weights[resourceType] || 10) * 1024; // Convert to bytes

    // We assume a baseline "total" traffic to calculate a percentage. 
    // This is a heuristic: for every blocked request, we assume there were ~10 allowed requests of similar size.
    // This gives us a "Page Load Improvement" metric that isn't 100% but reflects relative savings.
    dailyPerformance[today].blockedWeight += estimatedBytes;
    dailyPerformance[today].totalWeight += (estimatedBytes * 10); // Heuristic baseline

    // Keep only last 30 days to save space
    const keys = Object.keys(dailyBlocks).sort();
    if (keys.length > 30) {
        const keysToRemove = keys.slice(0, keys.length - 30);
        keysToRemove.forEach(k => {
            delete dailyBlocks[k];
            delete dailyPerformance[k];
        });
    }

    await chrome.storage.local.set({ dailyBlocks, dailyPerformance });
}