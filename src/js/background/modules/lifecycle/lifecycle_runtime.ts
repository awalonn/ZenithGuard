import { handleAlarm, type AlarmHandlerDeps } from "./alarm_handler";
import { handleInstalled, type InstallHandlerDeps } from "./install_handler";
import { handleStartup, type StartupHandlerDeps } from "./startup_handler";

function logLifecycleFailure(stage: string, error: unknown): void {
    console.error(`ZenithGuard: Lifecycle handler failed for ${stage}.`, error);
}

export type LifecycleRuntimeDeps = InstallHandlerDeps & StartupHandlerDeps & AlarmHandlerDeps;

async function ensureRuntimeState(deps: LifecycleRuntimeDeps): Promise<void> {
    await deps.initializeSettings();
    await deps.migrateRules();
    await deps.setupContextMenus();
    await deps.applyRules();
}

export function attachLifecycleRuntime(deps: LifecycleRuntimeDeps): void {
    chrome.runtime.onInstalled.addListener((details) => {
        handleInstalled(details, deps).catch((error) => logLifecycleFailure("onInstalled", error));
    });

    chrome.runtime.onStartup.addListener(() => {
        handleStartup(deps).catch((error) => logLifecycleFailure("onStartup", error));
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
        handleAlarm(alarm, deps).catch((error) => logLifecycleFailure(`onAlarm:${alarm.name}`, error));
    });

    ensureRuntimeState(deps).catch((error) => logLifecycleFailure("background-load", error));
}
