import { shouldRefreshSettingsData } from "./loaders";

export type SettingsLiveRefreshDeps = {
    refresh: () => void | Promise<void>;
};

export function attachSettingsLiveRefresh(deps: SettingsLiveRefreshDeps): () => void {
    const handleStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
    ): void => {
        if (shouldRefreshSettingsData(changes, areaName)) {
            void deps.refresh();
        }
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);

    return () => {
        chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
}
