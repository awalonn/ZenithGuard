import { AppSettings } from '../../types.js';

const FOCUS_MODE_RULE_ID_START = 7000;

const DEFAULT_DISTRACTING_SITES = [
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'tiktok.com',
    'reddit.com',
    'youtube.com',
    'netflix.com',
    'twitch.tv',
    'discord.com',
    'pinterest.com',
    'tumblr.com',
    '9gag.com',
    'imgur.com',
    'buzzfeed.com'
];

export async function getFocusModeRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
    const settings = await chrome.storage.sync.get(['isFocusModeEnabled', 'focusModeUntil', 'focusBlocklist']) as AppSettings & { focusModeUntil?: number, focusBlocklist?: string[] };

    // Check if active
    if (!settings.focusModeUntil || settings.focusModeUntil < Date.now()) {
        // Auto-disable if time expired
        if (settings.isFocusModeEnabled) {
            await chrome.storage.sync.set({ isFocusModeEnabled: false });
        }
        return [];
    }

    const sitesToBlock = settings.focusBlocklist && settings.focusBlocklist.length > 0
        ? settings.focusBlocklist
        : DEFAULT_DISTRACTING_SITES;

    const rules: chrome.declarativeNetRequest.Rule[] = sitesToBlock.map((domain, index) => ({
        id: FOCUS_MODE_RULE_ID_START + index,
        priority: 1, // Higher than allow? Lower? Usually strict blocking is high. But users might want to allow. Priority 1 matches default blocklist.
        action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { extensionPath: '/src/pages/focus_blocked.html' }
        },
        condition: {
            urlFilter: `||${domain}`,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME] // Only redirect the main page
        }
    }));

    return rules;
}

export async function startFocusMode(durationMinutes: number) {
    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    await chrome.storage.sync.set({
        isFocusModeEnabled: true,
        focusModeUntil: endTime
    });
    // Trigger rule update
    // Note: We need to import applyAllRules but that creates a circular dependency if rule_engine imports this.
    // Ideally, we just set storage, and the UI triggers the refresh, OR we listen to storage changes in background.
    // background.ts listens to storage changes and calls ruleEngine.applyAllRules().
}

export async function stopFocusMode() {
    await chrome.storage.sync.set({
        isFocusModeEnabled: false,
        focusModeUntil: 0
    });
}
