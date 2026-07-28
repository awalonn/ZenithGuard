import { jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const getActiveTab = jest.fn<AsyncMock>();
const getTabById = jest.fn<AsyncMock>();
const getLocal = jest.fn<AsyncMock>();
const getSync = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();
const setSync = jest.fn<AsyncMock>();
const removeLocal = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    getActiveTab,
    getTabById,
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
    removeLocal,
}));

jest.unstable_mockModule("../../src/js/background/modules/ai/config", () => ({
    resolveGeminiModel: jest.fn(() => "gemini-2.5-flash"),
}));

const { loadAnalyzerSupportData } = await import("../../src/ui/analyzer/loaders");

describe("analyzer loaders", () => {
    beforeEach(() => {
        getActiveTab.mockReset();
        getTabById.mockReset();
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        removeLocal.mockReset();
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

        const supportData = await loadAnalyzerSupportData();

        expect(supportData.networkBlocklistMeta).toEqual({
            "reuters.com": { source: "settings", addedAt: 20 },
        });
    });
});
