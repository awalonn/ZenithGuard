import { jest } from "@jest/globals";
import type { AiModule } from "../../src/js/background/modules/message_actions/ai_actions";

const sendContentMessage = jest.fn() as jest.Mock;
const sendContentMessageSafely = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;
const getLocal = jest.fn() as jest.Mock;
const getSync = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;
const removeLocal = jest.fn() as jest.Mock;
const startWallAssistTrace = jest.fn() as jest.Mock;
const appendWallAssistTraceStage = jest.fn() as jest.Mock;
const completeWallAssistTrace = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    sendContentMessage,
    sendContentMessageSafely,
}));

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    setLocal,
    getLocal,
    getSync,
    setSync,
    removeLocal,
}));

jest.unstable_mockModule("../../src/js/shared/wall_assist_trace", () => ({
    startWallAssistTrace,
    appendWallAssistTraceStage,
    completeWallAssistTrace,
}));

jest.unstable_mockModule("../../src/js/background/modules/ai/local_ai_runtime", () => ({
    classifyTextLocally: jest.fn(),
    getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

const { createAiActionRegistry } = await import("../../src/js/background/modules/message_actions/ai_actions");

function createMockAiModule(overrides: Partial<AiModule>): AiModule {
    return {
        analyzePage: jest.fn(async () => ({})),
        handleHideElementWithAI: jest.fn(async () => ({})),
        handleDefeatAdblockWall: jest.fn(async () => ({})),
        handleCookieConsent: jest.fn(async () => ({})),
        handleSummarizePrivacyPolicy: jest.fn(async () => ({})),
        resetAiClient: jest.fn(() => {}),
        handleSelfHealRule: jest.fn(async () => ({})),
        ...overrides,
    };
}

describe("ai action registry", () => {
    beforeEach(() => {
        sendContentMessage.mockReset();
        sendContentMessageSafely.mockReset();
        setLocal.mockReset();
        getLocal.mockReset();
        getSync.mockReset();
        setSync.mockReset();
        removeLocal.mockReset();
        startWallAssistTrace.mockReset();
        appendWallAssistTraceStage.mockReset();
        completeWallAssistTrace.mockReset();
        (getLocal as any).mockResolvedValue({});
        (sendContentMessage as any).mockResolvedValue({
            success: true,
            overlayMatchCount: 1,
            contentUnlockMatchCount: 1,
        });
        (globalThis as { chrome?: typeof chrome }).chrome = {
            tabs: {
                get: jest.fn(async (tabId: number) => ({
                    id: tabId,
                    url: "https://www.washingtonpost.com/world/example/",
                })),
            },
            webNavigation: {
                getAllFrames: jest.fn(async () => [{ frameId: 0 }]),
            },
            storage: {
                onChanged: {
                    addListener: jest.fn(),
                },
            },
        } as unknown as typeof chrome;
    });

    it("clears the processing toast when wall recovery returns a handled error result", async () => {
        const aiModule = createMockAiModule({
            handleDefeatAdblockWall: jest.fn(async () => ({ error: "No useful wall fix found." })),
        });
        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        const result = await registry.actions.DEFEAT_ADBLOCK_WALL({
            data: { tabId: 55 },
        });

        expect(result).toEqual({ error: "No useful wall fix found." });
        expect(sendContentMessageSafely).toHaveBeenCalledWith(55, { type: "CLEAR_PROCESSING_TOAST" });
    });

    it("clears the processing toast when wall recovery returns no selectors", async () => {
        const aiModule = createMockAiModule({
            handleDefeatAdblockWall: jest.fn(async () => ({})),
        });
        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        const result = await registry.actions.DEFEAT_ADBLOCK_WALL({
            data: { tabId: 91 },
        });

        expect(result).toEqual({});
        expect(sendContentMessageSafely).toHaveBeenCalledWith(91, { type: "CLEAR_PROCESSING_TOAST" });
    });

    it("shows a friendly timeout toast when wall recovery times out", async () => {
        const aiModule = createMockAiModule({
            handleDefeatAdblockWall: jest.fn(async () => ({ error: "AI_TIMEOUT" })),
        });
        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        const result = await registry.actions.DEFEAT_ADBLOCK_WALL({
            data: { tabId: 63 },
        });

        expect(result).toEqual({ error: "AI_TIMEOUT" });
        expect(sendContentMessageSafely).toHaveBeenCalledWith(63, { type: "CLEAR_PROCESSING_TOAST" });
        expect(sendContentMessageSafely).toHaveBeenCalledWith(63, {
            type: "SHOW_ERROR_TOAST",
            message: "Defeat Wall timed out. Retry once, or use Inspector for a manual cleanup on this page.",
        });
    });

    it("marks wall assist as partial when only the content selector matches", async () => {
        const aiModule = createMockAiModule({
            handleDefeatAdblockWall: jest.fn(async () => ({
                selectors: {
                    overlaySelector: "#paywall-qa",
                    contentUnlockSelector: "#main-content",
                },
            })),
        });
        (sendContentMessage as any).mockResolvedValue({
            success: true,
            overlayMatchCount: 0,
            contentUnlockMatchCount: 1,
        });

        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        await registry.actions.DEFEAT_ADBLOCK_WALL({
            data: { tabId: 88 },
        });

        expect(completeWallAssistTrace).toHaveBeenCalledWith(
            "www.washingtonpost.com",
            expect.objectContaining({
                status: "partial",
                summary: "AI only matched a content container. The blocker itself was not found.",
                finalStageLabel: "Only content nodes matched; the blocker selector matched nothing.",
                finalStageTone: "info",
            }),
        );
        expect(getLocal).toHaveBeenCalledWith("temporaryWallFixes");
        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: "#paywall-qa",
                    scrollSelector: undefined,
                    contentUnlockSelector: "#main-content",
                    reasoning: undefined,
                },
            },
        });
    });

    it("reuses an existing temporary wall-fix bucket across www variants", async () => {
        const aiModule = createMockAiModule({
            handleDefeatAdblockWall: jest.fn(async () => ({
                selectors: {
                    overlaySelector: "#paywall-qa",
                    contentUnlockSelector: "#main-content",
                },
            })),
        });
        (sendContentMessage as any).mockResolvedValue({
            success: true,
            overlayMatchCount: 1,
            contentUnlockMatchCount: 1,
        });
        (getLocal as any).mockResolvedValue({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: ".old-paywall",
                },
            },
        });

        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        await registry.actions.DEFEAT_ADBLOCK_WALL({
            data: { tabId: 89 },
        });

        expect(setLocal).toHaveBeenCalledWith({
            temporaryWallFixes: {
                "washingtonpost.com": {
                    overlaySelector: "#paywall-qa",
                    scrollSelector: undefined,
                    contentUnlockSelector: "#main-content",
                    reasoning: undefined,
                },
            },
        });
    });

    it("stores privacy-policy summaries under the apex cache key", async () => {
        const aiModule = createMockAiModule({
            handleSummarizePrivacyPolicy: jest.fn(async () => ({
                summary: "This site shares data with ad partners.",
            })),
        });

        const registry = createAiActionRegistry({
            getNetworkLogs: () => [],
            getAiModule: async () => aiModule,
        });

        await registry.actions.SUMMARIZE_PRIVACY_POLICY({
            data: {
                domain: "www.washingtonpost.com",
                policyUrl: "https://www.washingtonpost.com/privacy-policy/",
            },
        });

        expect(setLocal).toHaveBeenCalledWith({
            "privacy-summary-washingtonpost.com": expect.objectContaining({
                summary: {
                    summary: "This site shares data with ad partners.",
                },
            }),
        });
    });
});
