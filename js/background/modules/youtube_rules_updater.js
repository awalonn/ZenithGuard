// js/background/modules/youtube_rules_updater.js

const YOUTUBE_RULES_URL_KEY = 'rules/youtube_rules.json'; // Local file path
const YOUTUBE_RULES_CACHE_KEY = 'youtube-rules-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetches and updates the cached list of YouTube rules from a local JSON file.
 * @param {boolean} force - If true, bypasses the cache check.
 */
export async function updateYouTubeRules(force = false) {
    if (!force) {
        const cached = await chrome.storage.local.get(YOUTUBE_RULES_CACHE_KEY);
        if (cached[YOUTUBE_RULES_CACHE_KEY] && (Date.now() - cached[YOUTUBE_RULES_CACHE_KEY].lastUpdated < CACHE_DURATION_MS)) {
            return; // Cache is fresh
        }
    }

    try {
        console.log("ZenithGuard: Updating dynamic YouTube ad blocking rules from local source...");
        
        const rulesUrl = chrome.runtime.getURL(YOUTUBE_RULES_URL_KEY);
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
        console.log("ZenithGuard: Dynamic YouTube rules updated successfully.");

    } catch (error) {
        console.error("ZenithGuard: Failed to update dynamic YouTube rules.", error);
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