import { jest } from "@jest/globals";

import { createPrivacyActionRegistry } from "../../src/js/background/modules/message_actions/privacy_actions";

describe("privacy action registry", () => {
    it("broadcasts a network-log reset after clearing logs manually", async () => {
        const clearNetworkLogs = jest.fn(async () => {});
        const resetPrivacyStats = jest.fn(async () => {});
        const getNetworkLogSnapshot = jest.fn(async () => ({
            entries: [],
            sessionStartedAt: 1234,
            lastUpdatedAt: null,
        }));
        const broadcastNetworkLogReset = jest.fn<(tabId: number, sessionStartedAt: number | null) => void>();

        const registry = createPrivacyActionRegistry({
            getPrivacyStats: async () => ({
                grade: "A",
                score: 100,
                trackersDetected: 0,
                trackersBlocked: 0,
                trackersFound: [],
            }),
            getNetworkLogs: async () => [],
            getNetworkLogSnapshot,
            clearNetworkLogs,
            resetPrivacyStats,
            broadcastNetworkLogReset,
        });

        const result = await registry.actions.CLEAR_NETWORK_LOG({ tabId: 7 });

        expect(result).toEqual({ success: true });
        expect(clearNetworkLogs).toHaveBeenCalledWith(7);
        expect(resetPrivacyStats).toHaveBeenCalledWith(7);
        expect(getNetworkLogSnapshot).toHaveBeenCalledWith(7);
        expect(broadcastNetworkLogReset).toHaveBeenCalledWith(7, 1234);
    });
});
