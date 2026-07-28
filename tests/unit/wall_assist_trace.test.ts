import { jest } from "@jest/globals";

const getLocal = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    setLocal,
}));

const wallAssistTrace = await import("../../src/js/shared/wall_assist_trace");

describe("wall assist trace store", () => {
    beforeEach(() => {
        getLocal.mockReset();
        setLocal.mockReset();
    });

    it("reuses an existing trace bucket across www and non-www hostnames", async () => {
        (getLocal as any).mockResolvedValue({
            wallAssistTraceByHostname: {
                "washingtonpost.com": {
                    domain: "washingtonpost.com",
                    status: "running",
                    summary: "Wall assist run started.",
                    startedAt: 1,
                    updatedAt: 1,
                    stages: [],
                },
            },
        });

        await wallAssistTrace.appendWallAssistTraceStage("www.washingtonpost.com", "Consulting with Gemini AI...");

        expect(setLocal).toHaveBeenCalledWith({
            wallAssistTraceByHostname: {
                "washingtonpost.com": expect.objectContaining({
                    domain: "washingtonpost.com",
                    stages: [
                        expect.objectContaining({
                            label: "Consulting with Gemini AI...",
                        }),
                    ],
                }),
            },
        });
    });

    it("collapses legacy www and non-www trace buckets to the freshest matching entry", async () => {
        (getLocal as any).mockResolvedValue({
            wallAssistTraceByHostname: {
                "washingtonpost.com": {
                    domain: "washingtonpost.com",
                    status: "partial",
                    summary: "Older trace",
                    startedAt: 1,
                    updatedAt: 10,
                    stages: [{ label: "Older stage", tone: "info", timestamp: 10 }],
                },
                "www.washingtonpost.com": {
                    domain: "www.washingtonpost.com",
                    status: "success",
                    summary: "Newer trace",
                    startedAt: 2,
                    updatedAt: 20,
                    stages: [{ label: "Newer stage", tone: "success", timestamp: 20 }],
                },
            },
        });

        const result = await wallAssistTrace.getWallAssistTraceMap();

        expect(result).toEqual({
            "washingtonpost.com": {
                domain: "washingtonpost.com",
                status: "success",
                summary: "Newer trace",
                startedAt: 2,
                updatedAt: 20,
                lastError: undefined,
                overlaySelector: undefined,
                contentUnlockSelector: undefined,
                pageUrl: undefined,
                stages: [{ label: "Newer stage", tone: "success", timestamp: 20 }],
            },
        });
    });

    it("sanitizes malformed stored traces without leaking invalid fields", async () => {
        (getLocal as any).mockResolvedValue({
            wallAssistTraceByHostname: {
                "Example.COM": {
                    domain: 123,
                    pageUrl: 456,
                    status: "unexpected",
                    summary: "   ",
                    startedAt: "bad",
                    updatedAt: 50,
                    lastError: 123,
                    overlaySelector: false,
                    contentUnlockSelector: null,
                    stages: [
                        { label: "  Valid stage  ", tone: "success", timestamp: 40 },
                        { label: "", tone: "error", timestamp: 41 },
                        "bad stage",
                    ],
                },
            },
        });

        const result = await wallAssistTrace.getWallAssistTraceMap();

        expect(result["example.com"]).toEqual(expect.objectContaining({
            domain: "example.com",
            pageUrl: undefined,
            status: "running",
            summary: "Wall assist run started.",
            updatedAt: 50,
            lastError: undefined,
            overlaySelector: undefined,
            contentUnlockSelector: undefined,
            stages: [{ label: "Valid stage", tone: "success", timestamp: 40 }],
        }));
        expect(typeof result["example.com"]?.startedAt).toBe("number");
    });
});
