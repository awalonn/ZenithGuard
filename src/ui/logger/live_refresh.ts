const LOGGER_SYNC_REFRESH_KEYS = new Set([
    "networkBlocklist",
    "defaultBlocklist",
]);

const LOGGER_LOCAL_REFRESH_KEYS = new Set([
    "networkBlocklistMeta",
]);

export function shouldRefreshLoggerForStorageChanges(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
): boolean {
    const keys = Object.keys(changes);
    if (areaName === "sync") {
        return keys.some((key) => LOGGER_SYNC_REFRESH_KEYS.has(key));
    }

    if (areaName === "local") {
        return keys.some((key) => LOGGER_LOCAL_REFRESH_KEYS.has(key));
    }

    return false;
}

export type LoggerLiveRefreshDeps = {
    followActiveTab: boolean;
    getCurrentTabId: () => number | null;
    refreshAll: () => void | Promise<void>;
    refreshSupportData: () => void | Promise<void>;
    refreshContext: () => void | Promise<void>;
    clearSnapshot: () => void | Promise<void>;
};

export function attachLoggerLiveRefresh(deps: LoggerLiveRefreshDeps): () => void {
    const handleStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
    ): void => {
        if (shouldRefreshLoggerForStorageChanges(changes, areaName)) {
            void deps.refreshSupportData();
        }
    };

    const handleTabUpdated = (tabId: number, changeInfo: { status?: string }): void => {
        if (tabId === deps.getCurrentTabId() && changeInfo.status === "complete") {
            void deps.refreshContext();
        }
    };

    const handleTabRemoved = (tabId: number): void => {
        if (tabId === deps.getCurrentTabId()) {
            void Promise.resolve(deps.clearSnapshot()).then(() => deps.refreshContext());
        }
    };

    const handleTabActivated = (): void => {
        if (deps.followActiveTab) {
            void deps.refreshAll();
        }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    return () => {
        chrome.storage.onChanged.removeListener(handleStorageChanged);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
}
