import { jest } from "@jest/globals";

const getSync = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getSync,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessageSafely: jest.fn(),
}));

const tabManagerRuntime = await import("../../src/js/background/modules/tab_manager_runtime");

describe("tab_manager_runtime", () => {
    beforeEach(() => {
        getSync.mockReset();
        (globalThis as { chrome?: typeof chrome }).chrome = {
            browsingData: {
                remove: (jest.fn() as any).mockResolvedValue(undefined),
            },
            storage: {
                onChanged: {
                    addListener: jest.fn(),
                },
            },
            tabs: {
                query: (jest.fn() as any).mockResolvedValue([]),
                onUpdated: {
                    addListener: jest.fn(),
                },
                onRemoved: {
                    addListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;
    });

    it("clears broader site data for enabled forgetful sites on tab close", async () => {
        tabManagerRuntime.rememberTabUrl(11, "https://www.washingtonpost.com/world/story");
        (getSync as any).mockResolvedValue({
            forgetfulSites: [{ value: "washingtonpost.com", enabled: true }],
        });

        await tabManagerRuntime.handleForgetfulTabRemoval(11);

        expect(chrome.browsingData.remove).toHaveBeenCalledWith(
            { origins: ["https://www.washingtonpost.com"] },
            {
                cache: true,
                cacheStorage: true,
                cookies: true,
                indexedDB: true,
                localStorage: true,
                serviceWorkers: true,
            },
        );
    });

    it("does not clear site data for unrelated domains", async () => {
        tabManagerRuntime.rememberTabUrl(12, "https://example.com/article");
        (getSync as any).mockResolvedValue({
            forgetfulSites: [{ value: "washingtonpost.com", enabled: true }],
        });

        await tabManagerRuntime.handleForgetfulTabRemoval(12);

        expect(chrome.browsingData.remove).not.toHaveBeenCalled();
    });

    it("waits until the last matching tab closes before clearing site data", async () => {
        tabManagerRuntime.rememberTabUrl(13, "https://www.washingtonpost.com/world/story");
        (getSync as any).mockResolvedValue({
            forgetfulSites: [{ value: "washingtonpost.com", enabled: true }],
        });
        (chrome.tabs.query as any).mockResolvedValue([
            { id: 14, url: "https://washingtonpost.com/another-story" },
        ]);

        await tabManagerRuntime.handleForgetfulTabRemoval(13);

        expect(chrome.browsingData.remove).not.toHaveBeenCalled();
    });
});
