import type { ContentMessage } from "../../shared/content_messages";
import { sendContentMessage } from "../../shared/runtime_messages";

type ContextMenuActionType = Extract<ContentMessage, {
    type: "QUICK_HIDE_ELEMENT" | "START_AI_HIDING_TARGETED";
}>["type"];

type ZenithGuardContextMenuItem = {
    id: string;
    title: string;
    actionType: ContextMenuActionType;
    injectFiles?: string[];
};

const CONTEXT_MENU_ITEMS: ZenithGuardContextMenuItem[] = [
    {
        id: "zenithguard-quick-hide",
        title: "ZenithGuard: Quick Hide Element",
        actionType: "QUICK_HIDE_ELEMENT",
    },
    {
        id: "zenithguard-ai-hide-targeted",
        title: "ZenithGuard: Hide with AI...",
        actionType: "START_AI_HIDING_TARGETED",
        injectFiles: ["js/ai_hider.js"],
    },
];

function getRuntimeLastErrorMessage(): string | null {
    return chrome.runtime.lastError?.message || null;
}

function createContextMenuItem(item: ZenithGuardContextMenuItem): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.contextMenus.create(
            {
                id: item.id,
                title: item.title,
                contexts: ["all"],
            },
            () => {
                const errorMessage = getRuntimeLastErrorMessage();
                if (errorMessage) {
                    reject(new Error(errorMessage));
                    return;
                }

                resolve();
            },
        );
    });
}

async function recreateContextMenus(): Promise<void> {
    await chrome.contextMenus.removeAll();

    for (const item of CONTEXT_MENU_ITEMS) {
        await createContextMenuItem(item);
    }
}

async function injectFilesIfNeeded(tabId: number, files?: string[], frameId?: number): Promise<void> {
    if (!files || files.length === 0) {
        return;
    }

    await chrome.scripting.executeScript({
        target: typeof frameId === "number"
            ? { tabId, frameIds: [frameId] }
            : { tabId },
        files,
    });
}

function findMenuItem(menuItemId: string | number): ZenithGuardContextMenuItem | null {
    const id = String(menuItemId);
    return CONTEXT_MENU_ITEMS.find((item) => item.id === id) ?? null;
}

export async function handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
): Promise<void> {
    const item = findMenuItem(info.menuItemId);
    if (!item) {
        return;
    }

    const tabId = tab?.id;
    if (typeof tabId !== "number") {
        return;
    }

    try {
        const frameId = typeof info.frameId === "number" ? info.frameId : undefined;
        await injectFilesIfNeeded(tabId, item.injectFiles, frameId);
        await sendContentMessage(
            tabId,
            { type: item.actionType },
            typeof frameId === "number" ? { frameId } : undefined,
        );
    } catch (error) {
        console.warn(`ZenithGuard: Failed to run context menu action "${item.id}".`, error);
    }
}

export async function refreshContextMenus(): Promise<void> {
    try {
        await recreateContextMenus();
    } catch (error) {
        console.warn("ZenithGuard: Could not recreate extension context menus.", error);
    }
}

export function attachContextMenuRuntime(): void {
    refreshContextMenus().catch((error) => {
        console.warn("ZenithGuard: Context menu initialization failed.", error);
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        handleContextMenuClick(info, tab).catch((error) => {
            console.warn("ZenithGuard: Context menu click handling failed.", error);
        });
    });
}
