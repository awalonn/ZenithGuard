// js/settings/modules/subscription_presets.js
/**
 * BUNDLED_LISTS_PRESETS - Filter List Metadata
 * 
 * IMPORTANT: These lists serve DUAL purposes in ZenithGuard's hybrid architecture:
 * 
 * 1. STATIC DNR RULES (Network Blocking):
 *    - Built at dev-time by: `npm run update-rulesets`
 *    - Script: scripts/dev_build_static_rulesets.cjs
 *    - Output: src/rulesets/*.json (30,000 rules max per list)
 *    - Storage: Bundled in extension distribution package
 *    - Defined in: manifest.json declarativeNetRequest.rule_resources
 *    - User control: Enable/disable via toggle switches in dashboard
 *    - Performance: Ultra-fast native Chrome blocking, zero overhead
 * 
 * 2. DYNAMIC COSMETIC RULES (Element Hiding):
 *    - Fetched at runtime from: `sourceUrl` (below)
 *    - Parser: Extracts ##, #@#, #?# selectors from filter lists
 *    - Cache: chrome.storage.local with key `filterlist-{sourceUrl}`
 *    - Applied by: Content scripts on each page load
 *    - User control: "Update Lists" button in dashboard refreshes cache
 *    - Performance: Fast DOM hiding, applied per-page
 * 
 * WHY THE SPLIT?
 * - Chrome limits static rulesets to 30k rules each
 * - Full filter lists contain 60k+ total rules (network + cosmetic combined)
 * - Network blocking via DNR is much faster than JavaScript-based blocking
 * - Cosmetic rules can be updated without reinstalling the extension
 * 
 * DEVELOPER WORKFLOW:
 * 1. Run `npm run update-rulesets` to fetch latest network blocking rules
 * 2. Run `npm run build` to bundle them into the extension
 * 3. Users get static DNR rules immediately, cosmetic rules fetch at runtime
 * 
 * The `id` field MUST match the `id` in manifest.json declarativeNetRequest.
 * The `cosmeticRulesUrl` points to the local cosmetic file cache location.
 * The `sourceUrl` is the upstream URL for fetching fresh filter list data.
 */

export const BUNDLED_LISTS_PRESETS = [
    {
        id: 'easylist',
        name: 'EasyList - General Ad Blocking',
        description: 'The most popular and comprehensive ad-blocking list. Blocks most ads on international websites.',
        cosmeticRulesUrl: 'rules/easylist_cosmetic.json',
        sourceUrl: 'https://easylist.to/easylist/easylist.txt' // NEW
    },
    {
        id: 'easyprivacy',
        name: 'EasyPrivacy - Tracker Blocking',
        description: 'Blocks a wide range of trackers, analytics scripts, and other privacy-invasive technologies.',
        cosmeticRulesUrl: 'rules/easyprivacy_cosmetic.json',
        sourceUrl: 'https://easylist.to/easylist/easyprivacy.txt' // NEW
    },
    {
        id: 'annoyances',
        name: 'uBlock Annoyances List',
        description: 'Blocks common on-page annoyances like cookie consent banners, newsletter pop-ups, and social media widgets.',
        cosmeticRulesUrl: 'rules/ublock_annoyances_cosmetic.json',
        sourceUrl: 'https://easylist.to/easylist/fanboy-annoyance.txt' // FIXED: Use Fanboy's full list instead of uBlock's import-only file
    }
];