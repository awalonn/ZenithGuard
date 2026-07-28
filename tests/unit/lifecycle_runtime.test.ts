import { jest } from "@jest/globals";

const openExtensionPage = jest.fn(async () => {});
const refreshBackgroundSources = jest.fn(async () => {});

jest.unstable_mockModule("../../src/js/shared/browser", () => ({
    openExtensionPage,
}));

jest.unstable_mockModule("../../src/js/background/modules/lifecycle/background_sources", () => ({
    refreshBackgroundSources,
}));

const { attachLifecycleRuntime } = await import("../../src/js/background/modules/lifecycle/lifecycle_runtime");

type RuntimeListener<T> = (event: T) => void;

function createAsyncMock(): jest.MockedFunction<() => Promise<void>> {
    return jest.fn(async () => {});
}

async function flushAsyncTasks(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
    }
}

describe("attachLifecycleRuntime", () => {
    let installedListener: RuntimeListener<chrome.runtime.InstalledDetails> | null;
    let startupListener: (() => void) | null;
    let alarmListener: RuntimeListener<chrome.alarms.Alarm> | null;

    const deps = {
        initializeSettings: createAsyncMock(),
        migrateRules: createAsyncMock(),
        setupContextMenus: createAsyncMock(),
        applyRules: createAsyncMock(),
    };

    beforeEach(() => {
        installedListener = null;
        startupListener = null;
        alarmListener = null;
        openExtensionPage.mockClear();
        refreshBackgroundSources.mockClear();

        deps.initializeSettings.mockClear();
        deps.migrateRules.mockClear();
        deps.setupContextMenus.mockClear();
        deps.applyRules.mockClear();

        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                getManifest: jest.fn(() => ({ version: "3.2.2" })),
                getURL: jest.fn((path: string) => `chrome-extension://zenithguard/${path}`),
                onInstalled: {
                    addListener: jest.fn((listener: RuntimeListener<chrome.runtime.InstalledDetails>) => {
                        installedListener = listener;
                    }),
                },
                onStartup: {
                    addListener: jest.fn((listener: () => void) => {
                        startupListener = listener;
                    }),
                },
            },
            alarms: {
                create: jest.fn(async () => {}),
                clear: jest.fn(async () => true),
                onAlarm: {
                    addListener: jest.fn((listener: RuntimeListener<chrome.alarms.Alarm>) => {
                        alarmListener = listener;
                    }),
                },
            },
            tabs: {
                create: jest.fn(async () => ({ id: 1 })),
            },
        } as unknown as typeof chrome;
    });

    it("registers lifecycle listeners and reconciles runtime state when the background loads", async () => {
        attachLifecycleRuntime(deps);

        expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
        expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledTimes(1);
        expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
        expect(installedListener).toEqual(expect.any(Function));
        expect(startupListener).toEqual(expect.any(Function));
        expect(alarmListener).toEqual(expect.any(Function));

        await flushAsyncTasks();

        expect(deps.initializeSettings).toHaveBeenCalledTimes(1);
        expect(deps.migrateRules).toHaveBeenCalledTimes(1);
        expect(deps.setupContextMenus).toHaveBeenCalledTimes(1);
        expect(deps.applyRules).toHaveBeenCalledTimes(1);
        expect(refreshBackgroundSources).not.toHaveBeenCalled();
        expect(openExtensionPage).not.toHaveBeenCalled();

        const callOrder = [
            deps.initializeSettings.mock.invocationCallOrder[0],
            deps.migrateRules.mock.invocationCallOrder[0],
            deps.setupContextMenus.mock.invocationCallOrder[0],
            deps.applyRules.mock.invocationCallOrder[0],
        ];
        expect(callOrder).toEqual([...callOrder].sort((left, right) => left - right));
    });
});
