export function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: 'zenithguard-quick-hide', title: "ZenithGuard: Quick Hide Element", contexts: ['all'] });
        chrome.contextMenus.create({ id: 'zenithguard-ai-hide-targeted', title: "ZenithGuard: Hide with AI...", contexts: ['all'] });
    });
}

export function initializeContextMenuListeners() {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        const messageType = {
            'zenithguard-quick-hide': 'QUICK_HIDE_ELEMENT',
            'zenithguard-ai-hide-targeted': 'START_AI_HIDING_TARGETED'
        }[info.menuItemId];

        if (messageType && tab.id) {
            if (messageType === 'START_AI_HIDING_TARGETED') {
                try {
                    // AI Hider script injection
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['js/content/ai_hider.js']
                    });
                } catch (e) {
                    console.error("ZenithGuard: Failed to inject AI Hider script.", e);
                    return;
                }
            }
            chrome.tabs.sendMessage(tab.id, { type: messageType });
        }
    });
}
