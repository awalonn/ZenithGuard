import { jest } from "@jest/globals";

const isNetworkLogResetMessage = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    isNetworkLogResetMessage,
}));

const { attachAnalyzerLiveSync } = await import("../../src/ui/analyzer/live_sync");

type AnalyzerSyncTestState = {
    storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
    runtimeListeners: Array<(message: unknown) => void>;
    tabActivatedListeners: Array<() => void>;
    tabUpdatedListeners: Array<(tabId: number, changeInfo: { status?: string }) => void>;
    tabRemovedListeners: Array<(tabId: number) => void>;
};

describe("analyzer live sync", () => {
    beforeEach(() => {
        isNetworkLogResetMessage.mockReset();

        const storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];
        const runtimeListeners: Array<(message: unknown) => void> = [];
        const tabActivatedListeners: Array<() => void> = [];
        const tabUpdatedListeners: Array<(tabId: number, changeInfo: { status?: string }) => void> = [];
        const tabRemovedListeners: Array<(tabId: number) => void> = [];

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
                onActivated: {
                    addListener: jest.fn((listener: () => void) => {
                        tabActivatedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
                onUpdated: {
                    addListener: jest.fn((listener: (tabId: number, changeInfo: { status?: string }) => void) => {
                        tabUpdatedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
                onRemoved: {
                    addListener: jest.fn((listener: (tabId: number) => void) => {
                        tabRemovedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;

        (globalThis as typeof globalThis & { __analyzerSyncTest?: AnalyzerSyncTestState }).__analyzerSyncTest = {
            storageChangedListeners,
            runtimeListeners,
            tabActivatedListeners,
            tabUpdatedListeners,
            tabRemovedListeners,
        };
    });

    it("resets on analyzer page changes and invalidates reports on support-data changes", async () => {
        const onPageChanged = jest.fn(() => {});
        const onSupportDataChanged = jest.fn(() => {});
        const refreshContext = jest.fn(async () => {});

        const detach = attachAnalyzerLiveSync({
            followActiveTab: true,
            getCurrentTabId: () => 7,
            onPageChanged,
            onSupportDataChanged,
            refreshContext,
        });

        const listeners = (globalThis as typeof globalThis & { __analyzerSyncTest: AnalyzerSyncTestState }).__analyzerSyncTest;

        isNetworkLogResetMessage.mockImplementation((message) => (message as { type?: string }).type === "NETWORK_LOG_RESET");

        listeners.runtimeListeners[0]?.({ type: "NETWORK_LOG_RESET", tabId: 7, sessionStartedAt: Date.now() });
        await Promise.resolve();
        await Promise.resolve();

        listeners.tabUpdatedListeners[0]?.(7, { status: "complete" });
        await Promise.resolve();
        await Promise.resolve();

        listeners.tabActivatedListeners[0]?.();
        await Promise.resolve();
        await Promise.resolve();

        listeners.tabRemovedListeners[0]?.(7);
        await Promise.resolve();
        await Promise.resolve();

        listeners.storageChangedListeners[0]?.({
            networkBlocklist: {
                oldValue: [],
                newValue: ["ads.example.com"],
            },
        }, "sync");
        await Promise.resolve();

        listeners.tabUpdatedListeners[0]?.(8, { status: "complete" });
        await Promise.resolve();

        expect(onPageChanged).toHaveBeenCalledTimes(4);
        expect(refreshContext).toHaveBeenCalledTimes(4);
        expect(onSupportDataChanged).toHaveBeenCalledTimes(1);

        detach();
    });
});
