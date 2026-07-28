import { getActiveTab, openLoggerPage, openSettingsPage } from "../../../shared/browser";
import { sendContentMessage } from "../../../shared/runtime_messages";

export function attachCommandRuntime(): void {
    chrome.commands.onCommand.addListener(async (command) => {
        if (command === "open-settings") {
            await openSettingsPage();
            return;
        }

        if (command === "open-logger") {
            const activeTab = await getActiveTab();
            await openLoggerPage({ tabId: activeTab?.id });
            return;
        }

        if (command === "toggle-zapper") {
            const activeTab = await getActiveTab();
            if (!activeTab?.id) {
                return;
            }

            try {
                await sendContentMessage(activeTab.id, { type: "START_ZAPPER_MODE" }, { frameId: 0 });
            } catch (error) {
                console.warn(
                    "ZenithGuard: Could not toggle Zapper on this tab. Content script may not be loaded.",
                    error,
                );
            }
        }
    });
}
