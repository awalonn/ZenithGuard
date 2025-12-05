export function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: 'zenithguard-quick-hide', title: "ZenithGuard: Quick Hide Element", contexts: ['all'] });
        chrome.contextMenus.create({ id: 'zenithguard-ai-hide-targeted', title: "ZenithGuard: Hide with AI...", contexts: ['all'] });
    });
}

export function initializeContextMenuListeners() {
    chrome.contextMenus.onClicked.addListener(async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
        if (!tab || !tab.id) return;

        const messageTypeMap: Record<string, string> = {
            'zenithguard-quick-hide': 'QUICK_HIDE_ELEMENT',
            'zenithguard-ai-hide-targeted': 'START_AI_HIDING_TARGETED'
        };

        const messageType = messageTypeMap[info.menuItemId];

        if (messageType) {
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
