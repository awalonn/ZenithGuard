import { jest } from "@jest/globals";

const getActiveTab = jest.fn() as jest.Mock;
const openLoggerPage = jest.fn() as jest.Mock;
const openSettingsPage = jest.fn() as jest.Mock;
const sendContentMessage = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    getActiveTab,
    openLoggerPage,
    openSettingsPage,
}));

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessage,
}));

const { attachCommandRuntime } = await import("../../src/js/background/modules/lifecycle/command_runtime");

describe("command runtime", () => {
    let commandListener: ((command: string) => void | Promise<void>) | null = null;

    beforeEach(() => {
        getActiveTab.mockReset();
        openLoggerPage.mockReset();
        openSettingsPage.mockReset();
        sendContentMessage.mockReset();
        commandListener = null;

        (globalThis as { chrome?: typeof chrome }).chrome = {
            commands: {
                onCommand: {
                    addListener: jest.fn((listener: (command: string) => void | Promise<void>) => {
                        commandListener = listener;
                    }),
                },
            },
        } as unknown as typeof chrome;
    });

    it("starts Zapper only in the top frame", async () => {
        (getActiveTab as any).mockResolvedValue({ id: 42 });
        (sendContentMessage as any).mockResolvedValue({ success: true });

        attachCommandRuntime();
        await commandListener?.("toggle-zapper");

        expect(sendContentMessage).toHaveBeenCalledWith(42, {
            type: "START_ZAPPER_MODE",
        }, { frameId: 0 });
    });
});

export {};
