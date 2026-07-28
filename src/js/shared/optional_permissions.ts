const BROWSING_DATA_PERMISSION: chrome.permissions.Permissions = {
    permissions: ["browsingData"],
};

export async function hasBrowsingDataPermission(): Promise<boolean> {
    return chrome.permissions.contains(BROWSING_DATA_PERMISSION);
}

export async function requestBrowsingDataPermission(): Promise<boolean> {
    const granted = await chrome.permissions.request(BROWSING_DATA_PERMISSION);
    if (!granted) {
        throw new Error("Forgetful Browsing needs permission to clear this site's local browsing data.");
    }
    return true;
}
