import { jest } from "@jest/globals";

const getCachedTrackerDefinitions = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/background/modules/tracker_metadata_cache", () => ({
    getCachedTrackerDefinitions,
}));

const { TrackerRegistry } = await import("../../src/js/background/modules/privacy/tracker_registry");

describe("TrackerRegistry", () => {
    beforeEach(() => {
        getCachedTrackerDefinitions.mockReset();
    });

    it("resolves a tracker hostname to its canonical matched domain and category", async () => {
        (getCachedTrackerDefinitions as any).mockResolvedValue({
            DATA_BROKER: {
                domains: ["criteo.com"],
            },
        });

        const registry = new TrackerRegistry();
        await registry.load(true);

        expect(registry.resolveHost("static.criteo.com")).toEqual({
            domain: "criteo.com",
            category: "Advertising",
        });
    });
});
