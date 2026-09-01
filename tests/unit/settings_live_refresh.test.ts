import { jest } from "@jest/globals";

import { shouldRefreshSettingsData } from "../../src/ui/settings/loaders";
import { attachSettingsLiveRefresh } from "../../src/ui/settings/live_refresh";

type SettingsRefreshTestState = {
    storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
};

describe("settings live refresh", () => {
    beforeEach(() => {
        const storageChangedListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];

        (globalThis as { chrome?: typeof chrome }).chrome = {
            storage: {
                onChanged: {
                    addListener: jest.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
                        storageChangedListeners.push(listener);
                    }),
                    removeListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;

        (globalThis as typeof globalThis & { __settingsRefreshTest?: SettingsRefreshTestState }).__settingsRefreshTest = {
            storageChangedListeners,
        };
    });

    it("refreshes for live settings, rules, and Gemini config changes", async () => {
        expect(shouldRefreshSettingsData({
            isMalwareProtectionEnabled: {
                oldValue: true,
                newValue: false,
            },
        }, "sync")).toBe(true);

        expect(shouldRefreshSettingsData({
            geminiModelOverride: {
                oldValue: "",
                newValue: "gemini-3.1-pro-preview",
            },
        }, "sync")).toBe(true);

        expect(shouldRefreshSettingsData({
            networkBlocklistMeta: {
                oldValue: {},
                newValue: { "ads.example.com": { source: "settings" } },
            },
        }, "local")).toBe(true);

        expect(shouldRefreshSettingsData({
            unrelatedKey: {
                oldValue: 1,
                newValue: 2,
            },
        }, "sync")).toBe(false);

        const refresh = jest.fn(async () => {});
        const detach = attachSettingsLiveRefresh({ refresh });
        const listeners = (globalThis as typeof globalThis & { __settingsRefreshTest: SettingsRefreshTestState }).__settingsRefreshTest;

        listeners.storageChangedListeners[0]?.({
            geminiApiKey: {
                oldValue: "",
                newValue: "secret",
            },
        }, "local");
        await Promise.resolve();

        listeners.storageChangedListeners[0]?.({
            unrelatedKey: {
                oldValue: 1,
                newValue: 2,
            },
        }, "sync");
        await Promise.resolve();

        expect(refresh).toHaveBeenCalledTimes(1);

        detach();
    });
});
