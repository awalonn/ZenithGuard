import { refreshBackgroundSources } from "./background_sources";

export type StartupHandlerDeps = {
    initializeSettings: () => Promise<void>;
    migrateRules: () => Promise<void>;
    setupContextMenus: () => Promise<void>;
    applyRules: () => Promise<void>;
};

export async function handleStartup(deps: StartupHandlerDeps): Promise<void> {
    await deps.initializeSettings();
    await deps.migrateRules();
    await deps.setupContextMenus();
    await refreshBackgroundSources(false);
    await deps.applyRules();
}
