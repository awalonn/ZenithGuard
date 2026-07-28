import { jest } from "@jest/globals";

const getLocal = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    setLocal,
}));

const { PopupGuard } = await import("../../src/js/content/modules/PopupGuard");

function dispatchTrustedPointer(target: Element): void {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

describe("PopupGuard", () => {
    let now = 10_000;
    let nativeOpen: typeof window.open;
    let openMock: jest.Mock;

    beforeEach(() => {
        document.body.innerHTML = "";
        getLocal.mockReset();
        setLocal.mockReset();
        (getLocal as any).mockResolvedValue({ toolActivityLog: [] });
        now = 10_000;
        nativeOpen = window.open;
        openMock = jest.fn(() => ({}));
        window.open = openMock as unknown as typeof window.open;
    });

    afterEach(() => {
        window.open = nativeOpen;
    });

    function createGuard(): InstanceType<typeof PopupGuard> {
        return new PopupGuard({
            getHostname: () => "watch.example",
            getHref: () => "https://watch.example/movie",
            now: () => now,
            isTrustedEvent: () => true,
        });
    }

    it("blocks window.open calls without a recent trusted gesture", async () => {
        const guard = createGuard();
        guard.start();

        const result = window.open("https://ads.example/popup", "_blank");
        await Promise.resolve();
        await Promise.resolve();

        expect(result).toBeNull();
        expect(openMock).not.toHaveBeenCalled();
        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Popup Guard",
                    title: "Popup Blocked",
                    domain: "watch.example",
                }),
            ],
        });

        guard.stop();
    });

    it("allows same-site popups after normal trusted clicks", () => {
        const button = document.createElement("button");
        document.body.appendChild(button);
        const guard = createGuard();
        guard.start();

        dispatchTrustedPointer(button);
        const result = window.open("https://watch.example/help", "_blank");

        expect(result).not.toBeNull();
        expect(openMock).toHaveBeenCalledWith("https://watch.example/help", "_blank", undefined);

        guard.stop();
    });

    it("blocks cross-site popups immediately after video-player clicks", () => {
        const player = document.createElement("div");
        player.className = "video-player";
        document.body.appendChild(player);
        const guard = createGuard();
        guard.start();

        dispatchTrustedPointer(player);
        const result = window.open("https://casino.example/pop", "_blank");

        expect(result).toBeNull();
        expect(openMock).not.toHaveBeenCalled();

        guard.stop();
    });

    it("blocks cross-site popups after ordinary non-link clicks", () => {
        const button = document.createElement("button");
        document.body.appendChild(button);
        const guard = createGuard();
        guard.start();

        dispatchTrustedPointer(button);
        const result = window.open("https://ads.example/pop", "_blank");

        expect(result).toBeNull();
        expect(openMock).not.toHaveBeenCalled();

        guard.stop();
    });

    it("blocks blank popups immediately after video-player clicks", () => {
        const video = document.createElement("video");
        document.body.appendChild(video);
        const guard = createGuard();
        guard.start();

        dispatchTrustedPointer(video);
        const result = window.open("", "_blank");

        expect(result).toBeNull();
        expect(openMock).not.toHaveBeenCalled();

        guard.stop();
    });

    it("allows explicit cross-site links opened by trusted clicks", () => {
        const link = document.createElement("a");
        link.href = "https://external.example/page";
        link.className = "video-player";
        document.body.appendChild(link);
        const guard = createGuard();
        guard.start();

        dispatchTrustedPointer(link);
        const result = window.open("https://external.example/page", "_blank");

        expect(result).not.toBeNull();
        expect(openMock).toHaveBeenCalledWith("https://external.example/page", "_blank", undefined);

        guard.stop();
    });

    it("records blocked popup events from the page-world guard", async () => {
        const guard = createGuard();
        guard.start();

        window.dispatchEvent(new CustomEvent("__ZENITHGUARD_POPUP_BLOCKED__", {
            detail: { url: "https://ads.example/from-page-world" },
        }));
        await Promise.resolve();
        await Promise.resolve();

        expect(setLocal).toHaveBeenCalledWith({
            toolActivityLog: [
                expect.objectContaining({
                    tool: "Popup Guard",
                    message: "Blocked a forced popup to https://ads.example/from-page-world.",
                }),
            ],
        });

        guard.stop();
    });

    it("announces page-world guard state on start and stop", () => {
        const dispatchSpy = jest.spyOn(window, "dispatchEvent");
        const guard = createGuard();

        guard.start();
        guard.stop();

        const stateEvents = dispatchSpy.mock.calls
            .map(([event]) => event)
            .filter((event): event is CustomEvent<{ enabled: boolean }> =>
                event.type === "__ZENITHGUARD_POPUP_GUARD_STATE__"
            );
        expect(stateEvents.map((event) => event.detail)).toEqual([
            { enabled: true },
            { enabled: false },
        ]);

        dispatchSpy.mockRestore();
    });

    it("restores native window.open when stopped", () => {
        const guard = createGuard();
        guard.start();
        guard.stop();

        window.open("https://ads.example/popup", "_blank");

        expect(openMock).toHaveBeenCalledWith("https://ads.example/popup", "_blank");
    });
});
