import { jest } from "@jest/globals";

const removeLocal = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    removeLocal,
    setSync,
}));

jest.unstable_mockModule("../../src/js/background/modules/lifecycle/background_sources", () => ({
    refreshBackgroundSources: jest.fn(),
}));

const { handleAlarm } = await import("../../src/js/background/modules/lifecycle/alarm_handler");

describe("handleAlarm", () => {
    const applyRules = jest.fn(async () => {}) as jest.MockedFunction<() => Promise<void>>;

    beforeEach(() => {
        removeLocal.mockReset();
        setSync.mockReset();
        applyRules.mockReset();

        (globalThis as { chrome?: typeof chrome }).chrome = {
            alarms: {
                clear: jest.fn(async () => true),
            },
        } as unknown as typeof chrome;
    });

    it("ends focus mode and reapplies rules when the focus alarm fires", async () => {
        await handleAlarm({ name: "focusModeEnd" } as chrome.alarms.Alarm, { applyRules });

        expect(setSync).toHaveBeenCalledWith({ isFocusModeEnabled: false, focusModeUntil: 0 });
        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(chrome.alarms.clear).toHaveBeenCalledWith("focusModeEnd");
    });
});
