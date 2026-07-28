import { jest } from "@jest/globals";
import type { BackgroundActionMap } from "../../src/js/background/modules/message_registry";

const { attachMessageRuntime } = await import("../../src/js/background/modules/message_runtime");

type MessageListener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
) => boolean;

function installChromeMock(): { messageListeners: MessageListener[]; tabRemovedListeners: Array<(tabId: number) => void> } {
    const messageListeners: MessageListener[] = [];
    const tabRemovedListeners: Array<(tabId: number) => void> = [];

    (globalThis as { chrome?: typeof chrome }).chrome = {
        runtime: {
            id: "zenithguard-test-extension",
            onMessage: {
                addListener: jest.fn((listener: MessageListener) => {
                    messageListeners.push(listener);
                }),
            },
        },
        tabs: {
            onRemoved: {
                addListener: jest.fn((listener: (tabId: number) => void) => {
                    tabRemovedListeners.push(listener);
                }),
            },
        },
    } as unknown as typeof chrome;

    return { messageListeners, tabRemovedListeners };
}

async function flushMessageHandler(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("message runtime", () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        (globalThis as { chrome?: typeof chrome }).chrome = undefined;
    });

    it("rejects messages from unauthorized senders without dispatching handlers", () => {
        const { messageListeners } = installChromeMock();
        const handler = jest.fn();
        const actionRegistry = {
            APPLY_ALL_RULES: async () => {
                handler();
                return { success: true };
            },
        } satisfies BackgroundActionMap;

        attachMessageRuntime({
            actionRegistry,
        });

        const sendResponse = jest.fn();
        const keepAlive = messageListeners[0]?.(
            { type: "APPLY_ALL_RULES" },
            { id: "other-extension" },
            sendResponse,
        );

        expect(keepAlive).toBe(false);
        expect(sendResponse).toHaveBeenCalledWith({ error: "Unauthorized message sender." });
        expect(handler).not.toHaveBeenCalled();
    });

    it("rejects invalid messages before dispatch", () => {
        const { messageListeners } = installChromeMock();
        const handler = jest.fn();
        const actionRegistry = {
            APPLY_ALL_RULES: async () => {
                handler();
                return { success: true };
            },
        } satisfies BackgroundActionMap;

        attachMessageRuntime({
            actionRegistry,
        });

        const sendResponse = jest.fn();
        const keepAlive = messageListeners[0]?.(
            { type: "APPLY_RULES_AND_RELOAD_TAB", data: { tabId: -1 } },
            { id: chrome.runtime.id },
            sendResponse,
        );

        expect(keepAlive).toBe(false);
        expect(sendResponse).toHaveBeenCalledWith({
            error: "APPLY_RULES_AND_RELOAD_TAB data.tabId must be a non-negative integer.",
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("dispatches validated messages and returns handler responses asynchronously", async () => {
        const { messageListeners } = installChromeMock();
        const handler = jest.fn(async () => ({ success: true }));
        const actionRegistry = {
            APPLY_ALL_RULES: handler,
        } satisfies BackgroundActionMap;

        attachMessageRuntime({
            actionRegistry,
        });

        const sendResponse = jest.fn();
        const keepAlive = messageListeners[0]?.(
            { type: "APPLY_ALL_RULES" },
            { id: chrome.runtime.id },
            sendResponse,
        );

        await flushMessageHandler();

        expect(keepAlive).toBe(true);
        expect(handler).toHaveBeenCalledWith({ type: "APPLY_ALL_RULES" }, { id: chrome.runtime.id });
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it("wraps handler failures in a stable error response", async () => {
        const { messageListeners } = installChromeMock();
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
        const actionRegistry = {
            APPLY_ALL_RULES: async () => {
                throw new Error("handler failed");
            },
        } satisfies BackgroundActionMap;

        attachMessageRuntime({
            actionRegistry,
        });

        const sendResponse = jest.fn();
        const keepAlive = messageListeners[0]?.(
            { type: "APPLY_ALL_RULES" },
            { id: chrome.runtime.id },
            sendResponse,
        );

        await flushMessageHandler();

        expect(keepAlive).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({ error: "handler failed" });
        expect(consoleError).toHaveBeenCalledWith(
            "Error handling message APPLY_ALL_RULES:",
            expect.any(Error),
        );
    });

    it("forwards tab removal events to AI cleanup", () => {
        const { tabRemovedListeners } = installChromeMock();
        const onTabRemoved = jest.fn();
        const actionRegistry = {} satisfies BackgroundActionMap;

        attachMessageRuntime({
            actionRegistry,
            onTabRemoved,
        });

        tabRemovedListeners[0]?.(42);

        expect(onTabRemoved).toHaveBeenCalledWith(42);
    });
});
