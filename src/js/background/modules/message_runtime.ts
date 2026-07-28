import type { ValidatedMessage } from "./message_contracts/validator";
import { validateRuntimeMessage } from "./message_contracts/validator";
import { getActionHandler, type BackgroundActionMap } from "./message_registry";

function createErrorResponse(error: string): { error: string } {
    return { error };
}

function isAuthorizedSender(sender: chrome.runtime.MessageSender): boolean {
    return sender.id === chrome.runtime.id;
}

export type MessageRuntimeDeps = {
    actionRegistry: BackgroundActionMap;
    onTabRemoved?: (tabId: number) => void;
};

export function attachMessageRuntime(deps: MessageRuntimeDeps): void {
    if (deps.onTabRemoved) {
        chrome.tabs.onRemoved.addListener((tabId) => {
            deps.onTabRemoved?.(tabId);
        });
    }

    chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
        if (!isAuthorizedSender(sender)) {
            sendResponse(createErrorResponse("Unauthorized message sender."));
            return false;
        }

        const validation = validateRuntimeMessage(rawMessage);
        if (!validation.ok) {
            sendResponse(createErrorResponse("error" in validation ? validation.error : "Invalid message."));
            return false;
        }

        void (async (message: ValidatedMessage) => {
            try {
                const handler = getActionHandler(deps.actionRegistry, message.type);
                const response = await handler(message, sender);
                sendResponse(response);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage === "QUOTA_EXCEEDED" || errorMessage === "TAB_CLOSED") {
                    console.warn(`ZenithGuard: Handled known error in ${message.type}:`, errorMessage);
                } else {
                    console.error(`Error handling message ${message.type}:`, error);
                }
                sendResponse(createErrorResponse(errorMessage));
            }
        })(validation.message);

        return true;
    });
}
