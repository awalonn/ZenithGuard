import { jest } from "@jest/globals";

const sendContentMessage = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessage,
}));

const { handleContextMenuClick } = await import("../../src/js/background/modules/context_menu_runtime");

describe("context menu runtime", () => {
    beforeEach(() => {
        sendContentMessage.mockReset();
        (globalThis as { chrome?: typeof chrome }).chrome = {
            scripting: {
                executeScript: jest.fn(),
            },
            contextMenus: {
                create: jest.fn(),
                removeAll: jest.fn(),
                onClicked: {
                    addListener: jest.fn(),
                },
            },
            runtime: {},
        } as unknown as typeof chrome;
        (chrome.scripting.executeScript as any).mockResolvedValue([]);
    });

    it("runs Quick Hide in the frame that opened the context menu", async () => {
        (sendContentMessage as any).mockResolvedValue({ success: true });

        await handleContextMenuClick({
            menuItemId: "zenithguard-quick-hide",
            frameId: 7,
        } as chrome.contextMenus.OnClickData, { id: 42 } as chrome.tabs.Tab);

        expect(sendContentMessage).toHaveBeenCalledWith(42, {
            type: "QUICK_HIDE_ELEMENT",
        }, { frameId: 7 });
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it("injects AI hider and starts targeted AI hiding in the clicked frame", async () => {
        (sendContentMessage as any).mockResolvedValue({ success: true });

        await handleContextMenuClick({
            menuItemId: "zenithguard-ai-hide-targeted",
            frameId: 9,
        } as chrome.contextMenus.OnClickData, { id: 43 } as chrome.tabs.Tab);

        expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
            target: { tabId: 43, frameIds: [9] },
            files: ["js/ai_hider.js"],
        });
        expect(sendContentMessage).toHaveBeenCalledWith(43, {
            type: "START_AI_HIDING_TARGETED",
        }, { frameId: 9 });
    });
});

export {};
