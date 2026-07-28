import { removeLocal, setSync } from "../../../shared/storage_api";
import { refreshBackgroundSources } from "./background_sources";

export type AlarmHandlerDeps = {
    applyRules: () => Promise<void>;
};

export async function handleAlarm(
    alarm: chrome.alarms.Alarm,
    deps: AlarmHandlerDeps,
): Promise<void> {
    if (alarm.name === "dailyListUpdate") {
        await refreshBackgroundSources(false);
        return;
    }

    if (alarm.name === "resumeProtection") {
        await removeLocal("protectionPausedUntil");
        await deps.applyRules();
        await chrome.alarms.clear("resumeProtection");
        return;
    }

    if (alarm.name === "focusModeEnd") {
        await setSync({ isFocusModeEnabled: false, focusModeUntil: 0 });
        await deps.applyRules();
        await chrome.alarms.clear("focusModeEnd");
    }
}
