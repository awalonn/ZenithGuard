// js/settings/modules/subscription_presets.js
// REFACTORED: These are now metadata for the *bundled* static rulesets.
// The `id` MUST match the `id` in manifest.json
// The `cosmeticRulesUrl` points to the *local* cosmetic file.

export const BUNDLED_LISTS_PRESETS = [
    {
        id: 'easylist',
        name: 'EasyList - General Ad Blocking',
        description: 'The most popular and comprehensive ad-blocking list. Blocks most ads on international websites.',
        cosmeticRulesUrl: 'rules/easylist_cosmetic.json'
    },
    {
        id: 'easyprivacy',
        name: 'EasyPrivacy - Tracker Blocking',
        description: 'Blocks a wide range of trackers, analytics scripts, and other privacy-invasive technologies.',
        cosmeticRulesUrl: 'rules/easyprivacy_cosmetic.json'
    },
    {
        id: 'ublock_annoyances',
        name: 'uBlock Annoyances List',
        description: 'Blocks common on-page annoyances like cookie consent banners, newsletter pop-ups, and social media widgets.',
        cosmeticRulesUrl: 'rules/ublock_annoyances_cosmetic.json'
    }
];