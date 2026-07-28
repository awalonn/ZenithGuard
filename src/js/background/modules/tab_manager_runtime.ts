import { listHasMatchingHostname } from "../../shared/hostname_matching";
import { hasBrowsingDataPermission } from "../../shared/optional_permissions";
import { getSync } from "../../shared/storage_api";
import { sendContentMessageSafely } from "../../shared/runtime_messages";

type ToggleableSiteRule = {
    value: string;
    enabled: boolean;
};

type BreachWarningSettingsSnapshot = {
    isBreachWarningEnabled?: boolean;
};

type ForgetfulSitesSnapshot = {
    forgetfulSites?: ToggleableSiteRule[];
};

export const BREACH_WARNING_DEFAULT_DOMAINS = [
    "linkedin.com",
    "adobe.com",
    "canva.com",
    "dropbox.com",
    "myfitnesspal.com",
    "zynga.com",
    "twitter.com",
    "wattpad.com",
    "quora.com",
    "tumblr.com",
    "myheritage.com",
    "dubsmash.com",
    "verizon.com",
    "vk.com",
    "last.fm",
];

const tabUrlById = new Map<number, string>();

let breachWarningCacheValue: boolean | null = null;
let breachWarningCacheVersion = 0;
let breachWarningListenerAttached = false;

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase();
}

export function matchesTrackedDomain(hostname: string, candidates: string[]): boolean {
    return listHasMatchingHostname(candidates.map(normalizeHostname), normalizeHostname(hostname));
}

export function rememberTabUrl(tabId: number, url: string): void {
    tabUrlById.set(tabId, url);
}

export function getRememberedTabUrl(tabId: number): string | null {
    return tabUrlById.get(tabId) ?? null;
}

export function forgetTabUrl(tabId: number): void {
    tabUrlById.delete(tabId);
}

function attachBreachWarningStorageListener(): void {
    if (breachWarningListenerAttached) {
        return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync" || !changes.isBreachWarningEnabled) {
            return;
        }

        breachWarningCacheVersion += 1;
        breachWarningCacheValue = null;
    });

    breachWarningListenerAttached = true;
}

export async function isBreachWarningEnabled(): Promise<boolean> {
    const cacheVersion = breachWarningCacheVersion;
    if (breachWarningCacheValue !== null) {
        return breachWarningCacheValue;
    }

    const snapshot = await getSync<BreachWarningSettingsSnapshot>("isBreachWarningEnabled");
    const enabled = snapshot.isBreachWarningEnabled !== false;

    if (cacheVersion === breachWarningCacheVersion) {
        breachWarningCacheValue = enabled;
    }

    return enabled;
}

function getHostnameFromUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        return normalizeHostname(parsed.hostname);
    } catch {
        return null;
    }
}

export async function handleForgetfulTabRemoval(tabId: number): Promise<void> {
    const rememberedUrl = getRememberedTabUrl(tabId);
    forgetTabUrl(tabId);

    if (!rememberedUrl?.startsWith("http")) {
        return;
    }

    try {
        const parsedUrl = new URL(rememberedUrl);
        const snapshot = await getSync<ForgetfulSitesSnapshot>("forgetfulSites");
        const enabledRules = (snapshot.forgetfulSites ?? [])
            .filter((rule) => rule.enabled !== false)
            .map((rule) => normalizeHostname(rule.value));

        if (!matchesTrackedDomain(parsedUrl.hostname, enabledRules)) {
            return;
        }

        if (!(await hasBrowsingDataPermission())) {
            return;
        }

        const remainingTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        const hasSiblingTab = remainingTabs.some((tab) => {
            if (typeof tab.id !== "number" || tab.id === tabId || !tab.url?.startsWith("http")) {
                return false;
            }

            const siblingHostname = getHostnameFromUrl(tab.url);
            return Boolean(siblingHostname && matchesTrackedDomain(siblingHostname, enabledRules));
        });

        if (hasSiblingTab) {
            return;
        }

        await chrome.browsingData.remove(
            { origins: [parsedUrl.origin] },
            {
                cache: true,
                cacheStorage: true,
                cookies: true,
                indexedDB: true,
                localStorage: true,
                serviceWorkers: true,
            },
        );
    } catch (error) {
        console.warn(`ZenithGuard: Could not clear forgetful browsing data for tab ${tabId}.`, error);
    }
}

type TabUpdateInfo = {
    status?: string;
    url?: string;
};

async function handleBreachWarningCheck(
    tabId: number,
    changeInfo: TabUpdateInfo,
    tab: chrome.tabs.Tab,
): Promise<void> {
    if (changeInfo.status !== "complete" || !tab.url?.startsWith("http")) {
        return;
    }

    if (!await isBreachWarningEnabled()) {
        return;
    }

    const hostname = getHostnameFromUrl(tab.url);
    if (!hostname || !matchesTrackedDomain(hostname, BREACH_WARNING_DEFAULT_DOMAINS)) {
        return;
    }

    await sendContentMessageSafely(tabId, {
        type: "SHOW_BREACH_WARNING",
        domain: hostname,
    });
}

function handleTabUpdate(
    tabId: number,
    changeInfo: TabUpdateInfo,
    tab: chrome.tabs.Tab,
): void {
    if (typeof tabId === "number" && tab.url?.startsWith("http")) {
        rememberTabUrl(tabId, tab.url);
    } else if (typeof tabId === "number" && changeInfo.url?.startsWith("http")) {
        rememberTabUrl(tabId, changeInfo.url);
    }

    handleBreachWarningCheck(tabId, changeInfo, tab).catch((error) => {
        console.warn(`ZenithGuard: Breach-warning check failed for tab ${tabId}.`, error);
    });
}

export function attachTabManagerRuntime(): void {
    attachBreachWarningStorageListener();

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onRemoved.addListener((tabId) => {
        handleForgetfulTabRemoval(tabId).catch((error) => {
            console.warn(`ZenithGuard: Tab removal cleanup failed for ${tabId}.`, error);
        });
    });
}
