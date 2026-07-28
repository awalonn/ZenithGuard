import { isNetworkLogResetMessage, isNetworkLogUpdateMessage } from "../../js/shared/runtime_messages";

const POPUP_SYNC_REFRESH_KEYS = new Set([
    "isProtectionEnabled",
    "disabledSites",
    "isolationModeSites",
    "forgetfulSites",
    "customHidingRules",
    "persistentWallFixes",
    "isFocusModeEnabled",
    "focusModeUntil",
]);

const POPUP_LOCAL_REFRESH_KEYS = new Set([
    "toolActivityLog",
    "temporaryWallFixes",
    "cosmeticCleanupSummaryByHostname",
    "protectionPausedUntil",
    "wallAssistTraceByHostname",
]);
const AI_SCAN_CACHE_KEY_PREFIX = "ai-scan-cache-";

function shouldRefreshForStorageChanges(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
): boolean {
    const keys = Object.keys(changes);
    if (areaName === "sync") {
        return keys.some((key) => POPUP_SYNC_REFRESH_KEYS.has(key));
    }

    if (areaName === "local") {
        return keys.some((key) => POPUP_LOCAL_REFRESH_KEYS.has(key) || key.startsWith(AI_SCAN_CACHE_KEY_PREFIX));
    }

    return false;
}

export type PopupLiveRefreshDeps = {
    getCurrentTabId: () => number | null;
    refresh: () => Promise<void>;
};

export function attachPopupLiveRefresh(deps: PopupLiveRefreshDeps): () => void {
    let refreshInFlight = false;
    let refreshQueued = false;

    const runRefresh = async (): Promise<void> => {
        if (refreshInFlight) {
            refreshQueued = true;
            return;
        }

        refreshInFlight = true;
        try {
            await deps.refresh();
        } finally {
            refreshInFlight = false;
            if (refreshQueued) {
                refreshQueued = false;
                await runRefresh();
            }
        }
    };

    const scheduleRefresh = (): void => {
        void runRefresh();
    };

    const handleStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
    ): void => {
        if (shouldRefreshForStorageChanges(changes, areaName)) {
            scheduleRefresh();
        }
    };

    const handleRuntimeMessage = (message: unknown): void => {
        const currentTabId = deps.getCurrentTabId();
        if (typeof currentTabId !== "number") {
            return;
        }

        if (isNetworkLogUpdateMessage(message) && message.tabId === currentTabId) {
            scheduleRefresh();
            return;
        }

        if (isNetworkLogResetMessage(message) && message.tabId === currentTabId) {
            scheduleRefresh();
        }
    };

    const handleTabUpdated = (tabId: number, changeInfo: { status?: string }): void => {
        if (tabId === deps.getCurrentTabId() && changeInfo.status === "complete") {
            scheduleRefresh();
        }
    };

    const handleTabActivated = (): void => {
        scheduleRefresh();
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
        chrome.storage.onChanged.removeListener(handleStorageChanged);
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
}

export { shouldRefreshForStorageChanges };
