// js/background/modules/tracker_list_updater.js

// --- IMPROVED: Configuration moved to settings ---
// The tracker list URL is now stored in chrome.storage.sync as 'trackerListUrl'
// Users can configure this in the Advanced Settings section
// Default URL is set during initialization in storage_manager.js

const TRACKER_LIST_CACHE_KEY = 'tracker-list-cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetches and updates the cached list of tracker definitions.
 * @param {boolean} force - If true, bypasses the cache check.
 */
export async function updateTrackerList(force = false) {
    // Get the configured URL from settings
    const { trackerListUrl } = await chrome.storage.sync.get('trackerListUrl');

    if (!trackerListUrl || trackerListUrl.includes('YOUR_USERNAME')) {
        console.warn("ZenithGuard: Tracker list URL is not configured. Privacy Insights will be limited to the hard-coded fallback list.");
        return; // Don't fetch if the URL isn't configured
    }

    if (!force) {
        const cached = await chrome.storage.local.get(TRACKER_LIST_CACHE_KEY);
        if (cached[TRACKER_LIST_CACHE_KEY] && (Date.now() - cached[TRACKER_LIST_CACHE_KEY].lastUpdated < CACHE_DURATION_MS)) {
            return; // Cache is fresh
        }
    }

    try {
        console.log("ZenithGuard: Updating dynamic tracker list...");

        const response = await fetch(trackerListUrl, {
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch remote tracker list: ${response.statusText}`);
        }
        const dynamicList = await response.json();

        if (!dynamicList.SESSION_REPLAY || !dynamicList.DATA_BROKER) {
            throw new Error("Fetched tracker list file is invalid.");
        }

        await chrome.storage.local.set({
            [TRACKER_LIST_CACHE_KEY]: {
                list: dynamicList,
                lastUpdated: Date.now()
            }
        });
        console.log("ZenithGuard: Dynamic tracker list updated successfully.");

    } catch (error) {
        console.error("ZenithGuard: Failed to update dynamic tracker list.", error);
    }
}

/**
 * Retrieves the latest tracker definitions from the cache.
 * @returns {Promise<object|null>} The cached list object or null.
 */
export async function getLatestTrackerList() {
    const cache = await chrome.storage.local.get(TRACKER_LIST_CACHE_KEY);
    return cache[TRACKER_LIST_CACHE_KEY]?.list || null;
}