import { isNetworkLogResetMessage } from "../../js/shared/runtime_messages";

const ANALYZER_SYNC_REFRESH_KEYS = new Set([
    "networkBlocklist",
    "defaultBlocklist",
]);

const ANALYZER_LOCAL_REFRESH_KEYS = new Set([
    "networkBlocklistMeta",
]);

export type AnalyzerLiveSyncDeps = {
    followActiveTab: boolean;
    getCurrentTabId: () => number | null;
    onPageChanged: () => void | Promise<void>;
    onSupportDataChanged?: () => void | Promise<void>;
    refreshContext: () => void | Promise<void>;
};

export function shouldRefreshAnalyzerForStorageChanges(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
): boolean {
    const keys = Object.keys(changes);
    if (areaName === "sync") {
        return keys.some((key) => ANALYZER_SYNC_REFRESH_KEYS.has(key));
    }

    if (areaName === "local") {
        return keys.some((key) => ANALYZER_LOCAL_REFRESH_KEYS.has(key));
    }

    return false;
}

export function attachAnalyzerLiveSync(deps: AnalyzerLiveSyncDeps): () => void {
    const syncForCurrentTab = (): void => {
        void Promise.resolve(deps.onPageChanged()).then(() => deps.refreshContext());
    };

    const handleRuntimeMessage = (message: unknown): void => {
        const currentTabId = deps.getCurrentTabId();
        if (typeof currentTabId !== "number") {
            return;
        }

        if (isNetworkLogResetMessage(message) && message.tabId === currentTabId) {
            syncForCurrentTab();
        }
    };

    const handleTabUpdated = (tabId: number, changeInfo: { status?: string }): void => {
        if (tabId === deps.getCurrentTabId() && changeInfo.status === "complete") {
            syncForCurrentTab();
        }
    };

    const handleTabRemoved = (tabId: number): void => {
        if (tabId === deps.getCurrentTabId()) {
            syncForCurrentTab();
        }
    };

    const handleTabActivated = (): void => {
        if (deps.followActiveTab) {
            syncForCurrentTab();
        }
    };

    const handleStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
    ): void => {
        if (deps.onSupportDataChanged && shouldRefreshAnalyzerForStorageChanges(changes, areaName)) {
            void deps.onSupportDataChanged();
        }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    chrome.storage.onChanged.addListener(handleStorageChanged);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    return () => {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        chrome.storage.onChanged.removeListener(handleStorageChanged);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
}
