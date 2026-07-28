import { jest } from "@jest/globals";

import { attachLoggerLiveRefresh, shouldRefreshLoggerForStorageChanges } from "../../src/ui/logger/live_refresh";

type LoggerRefreshTestState = {
    storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
    tabActivatedListeners: Array<() => void>;
    tabUpdatedListeners: Array<(tabId: number, changeInfo: { status?: string }) => void>;
    tabRemovedListeners: Array<(tabId: number) => void>;
};

describe("logger live refresh", () => {
    beforeEach(() => {
        const storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];
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

        (globalThis as typeof globalThis & { __loggerRefreshTest?: LoggerRefreshTestState }).__loggerRefreshTest = {
            storageChangedListeners,
            tabActivatedListeners,
            tabUpdatedListeners,
            tabRemovedListeners,
        };
    });

    it("refreshes logger support data and tab context only for relevant live changes", async () => {
        expect(shouldRefreshLoggerForStorageChanges({
            networkBlocklist: {
                oldValue: [],
                newValue: ["ads.example.com"],
            },
        }, "sync")).toBe(true);

        expect(shouldRefreshLoggerForStorageChanges({
            networkBlocklistMeta: {
                oldValue: {},
                newValue: { "ads.example.com": { source: "logger" } },
            },
        }, "local")).toBe(true);

        expect(shouldRefreshLoggerForStorageChanges({
            unrelatedKey: {
                oldValue: 1,
                newValue: 2,
            },
        }, "local")).toBe(false);

        const refreshSupportData = jest.fn(async () => {});
        const refreshAll = jest.fn(async () => {});
        const refreshContext = jest.fn(async () => {});
        const clearSnapshot = jest.fn(async () => {});
        const detach = attachLoggerLiveRefresh({
            followActiveTab: true,
            getCurrentTabId: () => 7,
            refreshAll,
            refreshSupportData,
            refreshContext,
            clearSnapshot,
        });
        const listeners = (globalThis as typeof globalThis & { __loggerRefreshTest: LoggerRefreshTestState }).__loggerRefreshTest;

        listeners.storageChangedListeners[0]?.({
            networkBlocklist: {
                oldValue: [],
                newValue: ["ads.example.com"],
            },
        }, "sync");
        await Promise.resolve();

        listeners.storageChangedListeners[0]?.({
            unrelatedKey: {
                oldValue: 1,
                newValue: 2,
            },
        }, "sync");
        await Promise.resolve();

        listeners.tabUpdatedListeners[0]?.(7, { status: "complete" });
        await Promise.resolve();

        listeners.tabActivatedListeners[0]?.();
        await Promise.resolve();

        listeners.tabRemovedListeners[0]?.(7);
        await Promise.resolve();
        await Promise.resolve();

        listeners.tabUpdatedListeners[0]?.(8, { status: "complete" });
        await Promise.resolve();

        expect(refreshSupportData).toHaveBeenCalledTimes(1);
        expect(refreshAll).toHaveBeenCalledTimes(1);
        expect(refreshContext).toHaveBeenCalledTimes(2);
        expect(clearSnapshot).toHaveBeenCalledTimes(1);

        detach();
    });
});
