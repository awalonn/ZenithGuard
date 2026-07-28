import { attachCommandRuntime } from "./lifecycle/command_runtime";
import { attachLifecycleRuntime, type LifecycleRuntimeDeps } from "./lifecycle/lifecycle_runtime";
import { attachSettingsRuntime, type SettingsRuntimeDeps } from "./lifecycle/settings_runtime";

const BACKGROUND_INITIALIZED_KEY = "__zenithguard_background_initialized__";

type RuntimeModule = {
    name: string;
    run: () => void;
};

function initializeModule(module: RuntimeModule): void {
    try {
        module.run();
    } catch (error) {
        console.error(`ZenithGuard: Failed to initialize ${module.name}.`, error);
    }
}

function isBackgroundRuntimeInitialized(): boolean {
    return (globalThis as Record<string, unknown>)[BACKGROUND_INITIALIZED_KEY] === true;
}

function markBackgroundRuntimeInitialized(): void {
    (globalThis as Record<string, unknown>)[BACKGROUND_INITIALIZED_KEY] = true;
}

export type BackgroundBootstrapDeps = {
    attachNetworkLoggerRuntime: () => void;
    attachContextMenuRuntime: () => void;
    attachTabManagerRuntime: () => void;
    attachMessageHandlerRuntime: () => void;
    attachPrivacyRuntime: () => void;
    lifecycleDeps: LifecycleRuntimeDeps;
    settingsRuntimeDeps: SettingsRuntimeDeps;
};

export function initializeBackgroundRuntime(deps: BackgroundBootstrapDeps): void {
    if (isBackgroundRuntimeInitialized()) {
        console.info("ZenithGuard: Background runtime already initialized; skipping duplicate startup.");
        return;
    }

    const modules: RuntimeModule[] = [
        { name: "network logger", run: deps.attachNetworkLoggerRuntime },
        { name: "context menu listeners", run: deps.attachContextMenuRuntime },
        { name: "tab manager", run: deps.attachTabManagerRuntime },
        { name: "message handler", run: deps.attachMessageHandlerRuntime },
        { name: "privacy runtime", run: deps.attachPrivacyRuntime },
        { name: "lifecycle runtime", run: () => attachLifecycleRuntime(deps.lifecycleDeps) },
        { name: "settings runtime", run: () => attachSettingsRuntime(deps.settingsRuntimeDeps) },
        { name: "command runtime", run: attachCommandRuntime },
    ];

    modules.forEach(initializeModule);
    markBackgroundRuntimeInitialized();
}
