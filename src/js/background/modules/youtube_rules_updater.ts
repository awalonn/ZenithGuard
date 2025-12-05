// js/background/modules/youtube_rules_updater.js

// --- IMPROVED: Configuration moved to settings ---
// The YouTube rules URL is now stored in chrome.storage.sync as 'youtubeRulesUrl'
// Users can configure this in the Advanced Settings section
// Default URL is set during initialization in storage_manager.js

const YOUTUBE_RULES_CACHE_KEY = 'youtube-rules-cache';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetches and updates the cached list of YouTube rules from a remote JSON file.
 * @param {boolean} force - If true, bypasses the cache check.
 */
export async function updateYouTubeRules(force = false) {
    // Get the configured URL from settings
    const { youtubeRulesUrl } = await chrome.storage.sync.get('youtubeRulesUrl');

    if (!youtubeRulesUrl || youtubeRulesUrl.includes('YOUR_USERNAME')) {
        console.warn("ZenithGuard: YouTube rules URL is not configured. Using local fallback. Ad-blocking may be outdated.");
        await updateFromLocal(force);
        return;
    }

    if (!force) {
        const cached = await chrome.storage.local.get(YOUTUBE_RULES_CACHE_KEY);
        if (cached[YOUTUBE_RULES_CACHE_KEY] && (Date.now() - cached[YOUTUBE_RULES_CACHE_KEY].lastUpdated < CACHE_DURATION_MS)) {
            return; // Cache is fresh
        }
    }

    try {
        console.log("ZenithGuard: Updating dynamic YouTube ad blocking rules from remote source...");

        const response = await fetch(youtubeRulesUrl, {
            signal: AbortSignal.timeout(15000) // 15-second timeout
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch remote YouTube rules: ${response.statusText}`);
        }
        const dynamicRules = await response.json();

        if (!dynamicRules.regexFilters && !dynamicRules.urlFilters) {
            throw new Error("Fetched rules file is empty or invalid.");
        }

        await chrome.storage.local.set({
            [YOUTUBE_RULES_CACHE_KEY]: {
                rules: dynamicRules,
                lastUpdated: Date.now()
            }
        });
        console.log("ZenithGuard: Dynamic YouTube rules updated successfully.");

    } catch (error) {
        console.error("ZenithGuard: Failed to update dynamic YouTube rules. Using local fallback.", error);
        // If remote fails, try to load from local as a fallback
        await updateFromLocal(true); // Force local update as remote failed
    }
}

/**
 * Fallback function to load rules from the local extension package.
 */
async function updateFromLocal(force = false) {
    if (!force) {
        const cached = await chrome.storage.local.get(YOUTUBE_RULES_CACHE_KEY);
        if (cached[YOUTUBE_RULES_CACHE_KEY] && (Date.Now() - cached[YOUTUBE_RULES_CACHE_KEY].lastUpdated < CACHE_DURATION_MS)) {
            return; // Cache is fresh
        }
    }

    try {
        const rulesUrl = chrome.runtime.getURL('rules/youtube_rules.json');
        const response = await fetch(rulesUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch local YouTube rules: ${response.statusText}`);
        }
        const dynamicRules = await response.json();

        await chrome.storage.local.set({
            [YOUTUBE_RULES_CACHE_KEY]: {
                rules: dynamicRules,
                lastUpdated: Date.now()
            }
        });
    } catch (error) {
        console.error("ZenithGuard: Failed to load local fallback rules.", error);
    }
}


/**
 * Retrieves the latest YouTube rules from the cache.
 * @returns {Promise<object|null>} The cached rules object or null.
 */
export async function getLatestYouTubeRules() {
    const cache = await chrome.storage.local.get(YOUTUBE_RULES_CACHE_KEY);
    return cache[YOUTUBE_RULES_CACHE_KEY]?.rules || null;
}