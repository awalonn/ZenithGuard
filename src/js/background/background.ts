import { getTabHostname } from "../shared/browser";
import { sendContentMessageSafely } from "../shared/runtime_messages";
import { getAiHandlerModule, resetRecoveredAiModule } from "./modules/ai_handler";
import { initializeBackgroundRuntime } from "./modules/bootstrap";
import { attachContextMenuRuntime, refreshContextMenus } from "./modules/context_menu_runtime";
import { attachMessageRuntime } from "./modules/message_runtime";
import { combineActionRegistries } from "./modules/message_registry";
import { createAiActionRegistry } from "./modules/message_actions/ai_actions";
import { createPrivacyActionRegistry } from "./modules/message_actions/privacy_actions";
import { createRulesActionRegistry } from "./modules/message_actions/rules_actions";
import { clearNetworkLogsForTab, getNetworkLogSnapshotForTab, getNetworkLogsForTab } from "./modules/network_logger/log_store";
import { attachNetworkLoggerRuntime, broadcastNetworkLogReset } from "./modules/network_logger/runtime";
import { attachPrivacyRuntime, getPrivacyRuntime } from "./modules/privacy_runtime";
import { buildPrivacyInsights } from "./modules/privacy_insights/runtime";
import { applyRules } from "./modules/rule_engine";
import { initializeSettings, migrateStoredRules } from "./modules/storage/migrations";
import { attachTabManagerRuntime } from "./modules/tab_manager_runtime";
import type { ContentMessage } from "../shared/content_messages";

async function broadcastToAllTabs(message: ContentMessage): Promise<void> {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], status: "complete" });
    await Promise.allSettled(
        tabs.map((tab) => {
            if (typeof tab.id !== "number") {
                return Promise.resolve();
            }
            return sendContentMessageSafely(tab.id, message);
        }),
    );
}

const aiActions = createAiActionRegistry({
    getNetworkLogs: getNetworkLogsForTab,
    getAiModule: getAiHandlerModule,
});

let applyRulesQueue = Promise.resolve();

const applyAllRules = async (): Promise<void> => {
    const run = applyRulesQueue.then(async () => {
        await applyRules();
    });
    applyRulesQueue = run.catch(() => {});
    await run;
};

const rulesActions = createRulesActionRegistry({
    applyRules: applyAllRules,
    broadcastToAllTabs,
});

const privacyActions = createPrivacyActionRegistry({
    getPrivacyStats: (tabId) => getPrivacyRuntime().getStats(tabId),
    getNetworkLogs: getNetworkLogsForTab,
    getNetworkLogSnapshot: getNetworkLogSnapshotForTab,
    clearNetworkLogs: clearNetworkLogsForTab,
    resetPrivacyStats: (tabId) => getPrivacyRuntime().resetStats(tabId),
    broadcastNetworkLogReset,
    getPrivacyInsights: async (tabId) => buildPrivacyInsights(
        getNetworkLogsForTab(tabId),
        (await getTabHostname(tabId)) || "unknown",
    ),
});

const actionRegistry = combineActionRegistries(
    rulesActions.actions,
    aiActions.actions,
    privacyActions.actions,
);

initializeBackgroundRuntime({
    attachNetworkLoggerRuntime,
    attachContextMenuRuntime,
    attachTabManagerRuntime,
    attachMessageHandlerRuntime: () => attachMessageRuntime({
        actionRegistry,
        onTabRemoved: aiActions.onTabRemoved,
    }),
    attachPrivacyRuntime,
    lifecycleDeps: {
        initializeSettings,
        migrateRules: migrateStoredRules,
        setupContextMenus: refreshContextMenus,
        applyRules: applyAllRules,
    },
    settingsRuntimeDeps: {
        applyRules: applyAllRules,
        reapplyHidingRules: () => broadcastToAllTabs({ type: "REAPPLY_HIDING_RULES" }),
    },
});

void resetRecoveredAiModule();
