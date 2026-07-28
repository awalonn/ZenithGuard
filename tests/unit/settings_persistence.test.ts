import { jest } from "@jest/globals";

const getLocal = jest.fn<any>();
const getSync = jest.fn<any>();
const setLocal = jest.fn<any>();
const setSync = jest.fn<any>();
const removeLocal = jest.fn<any>();
const sendMessageSafely = jest.fn<any>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
    removeLocal,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendMessageSafely,
}));

const {
    persistCustomHidingRules,
    persistNetworkBlocklist,
    persistWallFixes,
} = await import("../../src/ui/settings/rules_controller");

describe("settings persistence helpers", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        removeLocal.mockReset();
        sendMessageSafely.mockReset();
    });

    it("normalizes custom hiding rules across www/apex buckets before persisting", async () => {
        await persistCustomHidingRules({
            "www.reuters.com": [
                { value: ".paywall", enabled: true },
            ],
            "reuters.com": [
                { value: ".signup", enabled: true },
                { value: ".paywall", enabled: false, lastHealed: 5 },
            ],
        });

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {
                "reuters.com": [
                    { value: ".paywall", enabled: true, lastHealed: 5 },
                    { value: ".signup", enabled: true },
                ],
            },
        });
        expect(sendMessageSafely).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
    });

    it("normalizes wall-fix buckets across www/apex variants before persisting", async () => {
        await persistWallFixes({
            "www.reuters.com": { overlaySelector: ".overlay", enabled: true },
            "reuters.com": { contentUnlockSelector: "#main-content" },
        });

        expect(setSync).toHaveBeenCalledWith({
            persistentWallFixes: {
                "reuters.com": {
                    overlaySelector: ".overlay",
                    contentUnlockSelector: "#main-content",
                    enabled: true,
                },
            },
        });
        expect(sendMessageSafely).toHaveBeenCalledWith({ type: "REAPPLY_HIDING_RULES" });
    });

    it("normalizes network blocklist metadata before persisting", async () => {
        await persistNetworkBlocklist([], {
            "www.reuters.com": { source: "logger", addedAt: 10 },
            "reuters.com": { source: "settings", addedAt: 20 },
        });

        expect(setLocal).toHaveBeenCalledWith({
            networkBlocklistMeta: {
                "reuters.com": { source: "settings", addedAt: 20 },
            },
        });
    });
});
