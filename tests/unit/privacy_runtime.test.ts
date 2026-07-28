import { jest } from "@jest/globals";

const getCachedTrackerDefinitions = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/background/modules/tracker_metadata_cache", () => ({
    getCachedTrackerDefinitions,
}));

const { PrivacyRuntime } = await import("../../src/js/background/modules/privacy_runtime");

describe("PrivacyRuntime", () => {
    beforeEach(() => {
        getCachedTrackerDefinitions.mockReset();
        (globalThis as { chrome?: typeof chrome }).chrome = {
            action: {
                setBadgeText: jest.fn(),
                setBadgeBackgroundColor: jest.fn(),
            },
        } as unknown as typeof chrome;
    });

    it("counts multiple subdomains of the same tracker network only once", async () => {
        (getCachedTrackerDefinitions as any).mockResolvedValue({
            DATA_BROKER: {
                domains: ["criteo.com"],
            },
        });

        const runtime = new PrivacyRuntime();
        await runtime.loadTrackers(true);

        runtime.processRequest(7, "https://static.criteo.com/tag.js");
        runtime.processRequest(7, "https://bidder.criteo.com/auction");

        const stats = runtime.getStats(7);

        expect(stats.trackersDetected).toBe(1);
        expect(stats.trackersBlocked).toBe(0);
        expect(stats.trackersFound).toEqual([
            {
                id: "criteo.com",
                name: "criteo.com",
                category: "Advertising",
            },
        ]);
    });

    it("drops per-tab stats when a tab is removed", async () => {
        (getCachedTrackerDefinitions as any).mockResolvedValue({
            DATA_BROKER: {
                domains: ["criteo.com"],
            },
        });

        const runtime = new PrivacyRuntime();
        await runtime.loadTrackers(true);

        runtime.processRequest(9, "https://static.criteo.com/tag.js");
        expect(runtime.getStats(9).trackersDetected).toBe(1);

        runtime.removeStats(9);

        expect(runtime.getStats(9)).toMatchObject({
            trackersDetected: 0,
            trackersBlocked: 0,
            trackersFound: [],
            grade: "A",
            score: 100,
        });
    });
});
