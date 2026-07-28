import { openExtensionPage } from "../../../shared/browser";
import { refreshBackgroundSources } from "./background_sources";

export type InstallHandlerDeps = {
    initializeSettings: () => Promise<void>;
    migrateRules: () => Promise<void>;
    setupContextMenus: () => Promise<void>;
    applyRules: () => Promise<void>;
};

export async function handleInstalled(
    details: chrome.runtime.InstalledDetails,
    deps: InstallHandlerDeps,
): Promise<void> {
    await deps.initializeSettings();

    if (details.reason === "install") {
        await openExtensionPage("src/pages/welcome.html");
    } else if (details.reason === "update") {
        const version = chrome.runtime.getManifest().version;
        if (details.previousVersion !== version) {
            await openExtensionPage(`src/pages/whats_new.html?v=${version}`);
        }
    }

    await deps.setupContextMenus();
    await deps.migrateRules();
    console.info("ZenithGuard: Refreshing bundled metadata caches and security feeds on install/update...");
    await refreshBackgroundSources(true);
    await deps.applyRules();
    await chrome.alarms.create("dailyListUpdate", { periodInMinutes: 1440 });
}
