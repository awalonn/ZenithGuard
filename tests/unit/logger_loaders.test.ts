import { jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const getNetworkLog = jest.fn<AsyncMock>();
const getLocal = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const removeLocal = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    getActiveTab: jest.fn(),
    getTabById: jest.fn(),
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
    removeLocal,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    getNetworkLog,
}));

const { getLoggerQueryState, loadLoggerEntries, loadLoggerSupportData } = await import("../../src/ui/logger/loaders");

describe("logger loaders", () => {
    beforeEach(() => {
        getNetworkLog.mockReset();
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        removeLocal.mockReset();
        window.history.replaceState({}, "", "/src/pages/logger.html");
    });

    it("reads review mode from logger query parameters", () => {
        window.history.replaceState({}, "", "/src/pages/logger.html?tabId=11&status=blocked&review=needs-review");

        expect(getLoggerQueryState()).toEqual({
            tabId: 11,
            search: "",
            source: null,
            status: "blocked",
            review: "needs-review",
        });
    });

    it("reads the newer network log snapshot shape", async () => {
        (getNetworkLog as any).mockResolvedValue({
            entries: [
                {
                    id: 1,
                    url: "https://cdn.example.com/script.js",
                    timestamp: Date.now(),
                    status: "blocked",
                },
            ],
            sessionStartedAt: 1234,
            lastUpdatedAt: 5678,
        });

        const snapshot = await loadLoggerEntries(7);

        expect(snapshot).toEqual({
            entries: [
                expect.objectContaining({
                    id: 1,
                    url: "https://cdn.example.com/script.js",
                    status: "blocked",
                }),
            ],
            sessionStartedAt: 1234,
            lastUpdatedAt: 5678,
        });
    });

    it("returns an empty snapshot when the network log request fails", async () => {
        (getNetworkLog as any).mockRejectedValue(new Error("No receiving end"));

        const snapshot = await loadLoggerEntries(7);

        expect(snapshot.entries).toHaveLength(0);
        expect(snapshot.sessionStartedAt).toBeNull();
        expect(snapshot.lastUpdatedAt).toBeNull();
    });

    it("normalizes network blocklist metadata across www/apex variants", async () => {
        getSync.mockResolvedValue({
            networkBlocklist: [],
            defaultBlocklist: [],
        });
        getLocal.mockResolvedValue({
            networkBlocklistMeta: {
                "www.reuters.com": { source: "logger", addedAt: 10 },
                "reuters.com": { source: "settings", addedAt: 20 },
            },
        });

        const supportData = await loadLoggerSupportData();

        expect(supportData.networkBlocklistMeta).toEqual({
            "reuters.com": { source: "settings", addedAt: 20 },
        });
    });
});
