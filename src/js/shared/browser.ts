export type LoggerPageOptions = {
    tabId?: number;
    search?: string;
    source?: string;
    status?: string;
    review?: string;
};

export type SettingsPageOptions = {
    section?: string;
    domain?: string;
    focus?: "network-blocklist";
};

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0] ?? null;
}

export async function getTabById(tabId: number): Promise<chrome.tabs.Tab | null> {
    try {
        return await chrome.tabs.get(tabId);
    } catch {
        return null;
    }
}

export async function getTabHostname(tabId: number): Promise<string | null> {
    const tab = await getTabById(tabId);
    if (!tab?.url) {
        return null;
    }

    try {
        return new URL(tab.url).hostname;
    } catch {
        return null;
    }
}

export function getExtensionPageUrl(path: string): string {
    return chrome.runtime.getURL(path);
}

export function getLoggerPageUrl(options?: LoggerPageOptions): string {
    const url = new URL(getExtensionPageUrl("src/pages/logger.html"));

    if (typeof options?.tabId === "number") {
        url.searchParams.set("tabId", String(options.tabId));
    }

    if (options?.search) {
        url.searchParams.set("search", options.search);
    }

    if (options?.source) {
        url.searchParams.set("source", options.source);
    }

    if (options?.status) {
        url.searchParams.set("status", options.status);
    }

    if (options?.review) {
        url.searchParams.set("review", options.review);
    }

    return url.toString();
}

export function getAnalyzerPageUrl(tabId?: number): string {
    const url = new URL(getExtensionPageUrl("src/pages/analyzer.html"));

    if (typeof tabId === "number") {
        url.searchParams.set("tabId", String(tabId));
    }

    return url.toString();
}

export function getSettingsPageUrl(options?: SettingsPageOptions): string {
    const url = new URL(getExtensionPageUrl("src/pages/settings.html"));

    if (options?.section) {
        url.searchParams.set("section", options.section);
    }

    if (options?.domain) {
        url.searchParams.set("domain", options.domain);
    }

    if (options?.focus) {
        url.searchParams.set("focus", options.focus);
    }

    return url.toString();
}

export async function openExtensionPage(path: string): Promise<void> {
    await chrome.tabs.create({ url: getExtensionPageUrl(path) });
}

export async function openAnalyzerPage(tabId?: number): Promise<void> {
    await chrome.tabs.create({ url: getAnalyzerPageUrl(tabId) });
}

export async function openLoggerPage(options?: LoggerPageOptions): Promise<void> {
    await chrome.tabs.create({ url: getLoggerPageUrl(options) });
}

export async function openSettingsPage(options?: SettingsPageOptions): Promise<void> {
    await chrome.tabs.create({ url: getSettingsPageUrl(options) });
}

export async function openOptionsPage(): Promise<void> {
    await chrome.runtime.openOptionsPage();
}

export async function closeCurrentTabOrWindow(): Promise<void> {
    try {
        const tab = await chrome.tabs.getCurrent();
        if (tab?.id) {
            await chrome.tabs.remove(tab.id);
            return;
        }
    } catch {
        // Fall back to window.close below.
    }

    window.close();
}
