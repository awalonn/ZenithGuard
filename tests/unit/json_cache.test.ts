import { jest } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const getLocal = jest.fn<AsyncMock>();
const setLocal = jest.fn<AsyncMock>();

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    setLocal,
}));

const { updateRemoteTextCache } = await import("../../src/js/background/modules/cache/json_cache");

describe("remote text cache", () => {
    beforeEach(() => {
        getLocal.mockReset();
        setLocal.mockReset();
        globalThis.fetch = jest.fn() as unknown as typeof fetch;
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("warns instead of erroring when remote refresh is blocked by proxy auth", async () => {
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
            ok: false,
            status: 407,
        } as Response);

        await updateRemoteTextCache({
            label: "malware domain list",
            cacheKey: "malware-list-cache",
            dataField: "domains",
            remoteUrl: "https://example.test/hosts",
            parse: () => ["blocked.example"],
        });

        expect(console.warn).toHaveBeenCalledWith(
            "ZenithGuard: Could not refresh malware domain list; using cached or bundled data.",
            expect.objectContaining({ status: 407 }),
        );
        expect(console.error).not.toHaveBeenCalled();
        expect(setLocal).not.toHaveBeenCalled();
    });

    it("stores parsed remote text when refresh succeeds", async () => {
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
            ok: true,
            text: async () => "0.0.0.0 malware.example",
        } as Response);

        await updateRemoteTextCache({
            label: "malware domain list",
            cacheKey: "malware-list-cache",
            dataField: "domains",
            remoteUrl: "https://example.test/hosts",
            parse: (text) => [text],
        });

        expect(setLocal).toHaveBeenCalledWith({
            "malware-list-cache": {
                domains: ["0.0.0.0 malware.example"],
                lastUpdated: expect.any(Number),
            },
        });
    });
});

export {};
