import { jest } from "@jest/globals";
import {
    FOCUS_RELATED_SYNC_KEYS,
    RULE_RELATED_SYNC_KEYS,
    attachSettingsRuntime,
} from "../../src/js/background/modules/lifecycle/settings_runtime";

describe("settings runtime", () => {
    let changeListener: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => Promise<void>) | undefined;
    const addListener = jest.fn() as jest.Mock;
    const applyRules = jest.fn(async () => {}) as jest.MockedFunction<() => Promise<void>>;
    const reapplyHidingRules = jest.fn(async () => {}) as jest.MockedFunction<() => Promise<void>>;

    beforeEach(() => {
        changeListener = undefined;
        addListener.mockReset();
        applyRules.mockClear();
        reapplyHidingRules.mockClear();
        addListener.mockImplementation((listener: typeof changeListener) => {
            changeListener = listener;
        });

        (globalThis as { chrome?: typeof chrome }).chrome = {
            storage: {
                onChanged: {
                    addListener,
                },
            },
        } as unknown as typeof chrome;
    });

    it("treats persistent wall fixes as a rule-related setting change", () => {
        expect(RULE_RELATED_SYNC_KEYS).toContain("persistentWallFixes");
    });

    it("treats global protection as a rule-related setting change", () => {
        expect(RULE_RELATED_SYNC_KEYS).toContain("isProtectionEnabled");
    });

    it("reapplies rules and hiding when a rule-related sync setting changes", async () => {
        attachSettingsRuntime({ applyRules, reapplyHidingRules });

        await changeListener?.({
            isProtectionEnabled: { oldValue: true, newValue: false },
        }, "sync");

        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(reapplyHidingRules).toHaveBeenCalledTimes(1);
    });

    it("reapplies rules without hiding when only focus settings change", async () => {
        expect(FOCUS_RELATED_SYNC_KEYS).toContain("focusBlocklist");
        attachSettingsRuntime({ applyRules, reapplyHidingRules });

        await changeListener?.({
            focusBlocklist: { oldValue: [], newValue: ["news.example"] },
        }, "sync");

        expect(applyRules).toHaveBeenCalledTimes(1);
        expect(reapplyHidingRules).not.toHaveBeenCalled();
    });

    it("ignores unrelated or non-sync storage changes", async () => {
        attachSettingsRuntime({ applyRules, reapplyHidingRules });

        await changeListener?.({
            networkBlocklistMeta: { oldValue: {}, newValue: { "ads.example": {} } },
        }, "local");
        await changeListener?.({
            networkBlocklistMeta: { oldValue: {}, newValue: { "ads.example": {} } },
        }, "sync");

        expect(applyRules).not.toHaveBeenCalled();
        expect(reapplyHidingRules).not.toHaveBeenCalled();
    });
});
