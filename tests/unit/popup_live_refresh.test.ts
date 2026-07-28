import { jest } from "@jest/globals";

const isNetworkLogUpdateMessage = jest.fn() as jest.Mock;
const isNetworkLogResetMessage = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    isNetworkLogUpdateMessage,
    isNetworkLogResetMessage,
}));

const { attachPopupLiveRefresh, shouldRefreshForStorageChanges } = await import("../../src/ui/popup/live_refresh");

type PopupRefreshTestState = {
    storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
    runtimeListeners: Array<(message: unknown) => void>;
    tabUpdatedListeners: Array<(tabId: number, changeInfo: { status?: string }) => void>;
    tabActivatedListeners: Array<() => void>;
};

describe("popup live refresh", () => {
    beforeEach(() => {
        isNetworkLogUpdateMessage.mockReset();
        isNetworkLogResetMessage.mockReset();

        const storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];
        const runtimeListeners: Array<(message: unknown) => void> = [];
        const tabUpdatedListeners: Array<(tabId: number, changeInfo: { status?: string }) => void> = [];
        const tabActivatedListeners: Array<() => void> = [];

        (globalThis as { chrome?: typeof chrome }).chrome = {
            storage: {
                onChanged: {
                    addListener: jest.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
                        storageChangedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
            runtime: {
                onMessage: {
                    addListener: jest.fn((listener: (message: unknown) => void) => {
                        runtimeListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
            tabs: {
                onUpdated: {
                    addListener: jest.fn((listener: (tabId: number, changeInfo: { status?: string }) => void) => {
                        tabUpdatedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
                onActivated: {
                    addListener: jest.fn((listener: () => void) => {
                        tabActivatedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;

        (globalThis as typeof globalThis & { __popupRefreshTest?: PopupRefreshTestState }).__popupRefreshTest = {
            storageChangedListeners,
            runtimeListeners,
            tabUpdatedListeners,
            tabActivatedListeners,
        };
    });

    it("refreshes for relevant popup storage keys", () => {
        expect(shouldRefreshForStorageChanges({
            disabledSites: {
                oldValue: [],
                newValue: ["example.com"],
            },
        }, "sync")).toBe(true);

        expect(shouldRefreshForStorageChanges({
            wallAssistTraceByHostname: {
                oldValue: {},
                newValue: { "example.com": {} },
            },
        }, "local")).toBe(true);

        expect(shouldRefreshForStorageChanges({
            "ai-scan-cache-https%3A%2F%2Fexample.com%2Farticle": {
                oldValue: undefined,
                newValue: { score: "cached" },
            },
        }, "local")).toBe(true);

        expect(shouldRefreshForStorageChanges({
            unrelatedKey: {
                oldValue: 1,
                newValue: 2,
            },
        }, "local")).toBe(false);
    });

    it("refreshes for matching network-log messages and completed tab reloads", async () => {
        let currentTabId = 7;
        const refresh = jest.fn(async () => {});

        const detach = attachPopupLiveRefresh({
            getCurrentTabId: () => currentTabId,
            refresh,
        });

        const listeners = (globalThis as unknown as typeof globalThis & {
            __popupRefreshTest: PopupRefreshTestState;
        }).__popupRefreshTest;

        isNetworkLogUpdateMessage.mockImplementation((message) => (message as { type?: string }).type === "NETWORK_LOG_UPDATE");
        isNetworkLogResetMessage.mockImplementation((message) => (message as { type?: string }).type === "NETWORK_LOG_RESET");

        listeners.runtimeListeners[0]?.({
            type: "NETWORK_LOG_UPDATE",
            tabId: 7,
            log: { id: 1, url: "https://cdn.example.com", status: "blocked", timestamp: Date.now() },
        });
        await Promise.resolve();

        listeners.runtimeListeners[0]?.({
            type: "NETWORK_LOG_RESET",
            tabId: 7,
            sessionStartedAt: Date.now(),
        });
        await Promise.resolve();

        listeners.tabUpdatedListeners[0]?.(7, { status: "complete" });
        await Promise.resolve();

        listeners.tabActivatedListeners[0]?.();
        await Promise.resolve();

        currentTabId = 9;
        listeners.runtimeListeners[0]?.({
            type: "NETWORK_LOG_UPDATE",
            tabId: 7,
            log: { id: 2, url: "https://cdn.example.com", status: "blocked", timestamp: Date.now() },
        });
        await Promise.resolve();

        expect(refresh).toHaveBeenCalledTimes(4);

        detach();
    });
});
