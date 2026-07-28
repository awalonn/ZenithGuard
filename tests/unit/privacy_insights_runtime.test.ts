import { jest } from "@jest/globals";

const getAiHandlerModule = jest.fn() as jest.Mock;
const canUseLocalAiTrackerInsights = jest.fn() as jest.Mock;
const classifyTrackerDomainWithLocalAi = jest.fn() as jest.Mock;
const summarizeNetworkLogWithGemini = jest.fn() as jest.Mock;
const getTrackerInsightDefinitions = jest.fn() as jest.Mock;
const createDomainInsight = jest.fn() as jest.Mock;
const createGeminiTrackerSummary = jest.fn() as jest.Mock;
const createLocalAiTrackerInsight = jest.fn() as jest.Mock;
const createTrackerCountInsight = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/background/modules/ai_handler", () => ({
    getAiHandlerModule,
}));

jest.unstable_mockModule("../../src/js/background/modules/message_actions/ai_actions", () => ({
    canUseLocalAiTrackerInsights,
    classifyTrackerDomainWithLocalAi,
    summarizeNetworkLogWithGemini,
}));

jest.unstable_mockModule("../../src/js/background/modules/privacy_insights/definitions", () => ({
    createDomainInsight,
    createGeminiTrackerSummary,
    createLocalAiTrackerInsight,
    createTrackerCountInsight,
    getTrackerInsightDefinitions,
}));

const { buildPrivacyInsights } = await import("../../src/js/background/modules/privacy_insights/runtime");

describe("buildPrivacyInsights", () => {
    beforeEach(() => {
        getAiHandlerModule.mockReset();
        canUseLocalAiTrackerInsights.mockReset();
        classifyTrackerDomainWithLocalAi.mockReset();
        summarizeNetworkLogWithGemini.mockReset();
        getTrackerInsightDefinitions.mockReset();
        createDomainInsight.mockReset();
        createGeminiTrackerSummary.mockReset();
        createLocalAiTrackerInsight.mockReset();
        createTrackerCountInsight.mockReset();

        (canUseLocalAiTrackerInsights as any).mockReturnValue(false);
        (summarizeNetworkLogWithGemini as any).mockResolvedValue(null);
        (createDomainInsight as any).mockImplementation((_category: string, _definition: unknown, domain: string) => ({
            type: "alert",
            icon: "database",
            message: `Matched ${domain}`,
        }));
        (createGeminiTrackerSummary as any).mockImplementation((summary: string) => ({
            type: "info",
            icon: "brain",
            message: summary,
        }));
        (createLocalAiTrackerInsight as any).mockImplementation((domain: string) => ({
            type: "alert",
            icon: "brain",
            message: `Local ${domain}`,
        }));
        (createTrackerCountInsight as any).mockImplementation((count: number) => ({
            type: "info",
            icon: "shield",
            message: `Count ${count}`,
        }));
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("matches tracker definitions on real domain boundaries", async () => {
        (getTrackerInsightDefinitions as any).mockResolvedValue({
            isHardcoded: false,
            definitions: {
                DATA_BROKER: {
                    domains: ["criteo.com"],
                    message: "Matched {domain}",
                },
            },
        });

        const insights = await buildPrivacyInsights([
            { url: "https://ads.criteo.com/tag.js", status: "blocked" },
        ], "example.com");

        expect(insights).toEqual([
            expect.objectContaining({
                message: "Matched criteo.com",
            }),
        ]);
    });

    it("does not create false positives from loose hostname substrings", async () => {
        (getTrackerInsightDefinitions as any).mockResolvedValue({
            isHardcoded: false,
            definitions: {
                DATA_BROKER: {
                    domains: ["criteo.com"],
                    message: "Matched {domain}",
                },
            },
        });

        const insights = await buildPrivacyInsights([
            { url: "https://notcriteo.com/tracker.js", status: "blocked" },
        ], "example.com");

        expect(insights).toEqual([]);
    });

    it("treats optional local AI insight failures as warnings", async () => {
        (getTrackerInsightDefinitions as any).mockResolvedValue({
            isHardcoded: false,
            definitions: {},
        });
        (canUseLocalAiTrackerInsights as any).mockReturnValue(true);
        (classifyTrackerDomainWithLocalAi as any).mockRejectedValue(new Error("model unavailable"));

        const insights = await buildPrivacyInsights([
            { url: "https://ads-one.example/tag.js", status: "blocked" },
            { url: "https://ads-two.example/tag.js", status: "blocked" },
            { url: "https://ads-three.example/tag.js", status: "blocked" },
        ], "example.com");

        expect(insights).toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(
            "ZenithGuard: Local AI Insight unavailable for domain",
            expect.any(String),
            expect.any(Error),
        );
        expect(console.error).not.toHaveBeenCalled();
    });
});
