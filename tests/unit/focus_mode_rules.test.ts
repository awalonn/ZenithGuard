import { jest } from "@jest/globals";

const getSync = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getSync,
    setSync,
}));

const { createFocusModeRules } = await import("../../src/js/background/modules/storage/defaults");

describe("createFocusModeRules", () => {
    beforeEach(() => {
        getSync.mockReset();
        setSync.mockReset();

        (globalThis as { chrome?: typeof chrome }).chrome = {
            declarativeNetRequest: {
                RuleActionType: {
                    REDIRECT: "redirect",
                },
                ResourceType: {
                    MAIN_FRAME: "main_frame",
                },
            },
        } as unknown as typeof chrome;
    });

    it("builds focus-mode rules that cover both apex and www hostnames", async () => {
        (getSync as any).mockResolvedValue({
            isFocusModeEnabled: true,
            focusModeUntil: Date.now() + 60_000,
            focusBlocklist: ["washingtonpost.com"],
        });

        const rules = await createFocusModeRules();

        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({
            action: {
                type: "redirect",
                redirect: { extensionPath: "/src/pages/focus_blocked.html" },
            },
            condition: {
                requestDomains: ["washingtonpost.com", "www.washingtonpost.com"],
                resourceTypes: ["main_frame"],
            },
        });
    });
});
