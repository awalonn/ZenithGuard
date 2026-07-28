import { jest } from "@jest/globals";

const getSync = jest.fn() as jest.Mock;
const getLocal = jest.fn() as jest.Mock;
const setSync = jest.fn() as jest.Mock;
const setLocal = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/storage_api", () => ({
    getLocal,
    getSync,
    setLocal,
    setSync,
}));

const { Zapper } = await import("../../src/js/content/modules/Zapper");

describe("Zapper", () => {
    beforeEach(() => {
        getLocal.mockReset();
        getSync.mockReset();
        setLocal.mockReset();
        setSync.mockReset();
        document.body.innerHTML = "";
        document.head.innerHTML = "";
    });

    it("toggles off when started again", () => {
        const zapper = new Zapper({
            onSaveRule: async () => {},
            onReapply: () => {},
            showToast: () => {},
        });

        zapper.toggle();
        expect(document.getElementById("zg-zapper-highlight")).not.toBeNull();
        expect(document.getElementById("zg-zapper-banner")).not.toBeNull();

        zapper.toggle();
        expect(document.getElementById("zg-zapper-highlight")).toBeNull();
        expect(document.getElementById("zg-zapper-banner")).toBeNull();
    });

    it("removes stale Zapper UI before mounting a new toolbar", () => {
        const staleHighlight = document.createElement("div");
        staleHighlight.id = "zg-zapper-highlight";
        const staleBanner = document.createElement("div");
        staleBanner.id = "zg-zapper-banner";
        staleBanner.textContent = "old toolbar";
        document.body.appendChild(staleHighlight);
        document.body.appendChild(staleBanner);

        const zapper = new Zapper({
            onSaveRule: async () => {},
            onReapply: () => {},
            showToast: () => {},
        });

        zapper.start();

        expect(document.querySelectorAll("#zg-zapper-highlight")).toHaveLength(1);
        expect(document.querySelectorAll("#zg-zapper-banner")).toHaveLength(1);
        expect(document.getElementById("zg-zapper-banner")?.textContent).not.toBe("old toolbar");
    });

    it("removes all stale Zapper UI nodes on stop", () => {
        const zapper = new Zapper({
            onSaveRule: async () => {},
            onReapply: () => {},
            showToast: () => {},
        });

        zapper.start();

        const staleBanner = document.createElement("div");
        staleBanner.id = "zg-zapper-banner";
        document.body.appendChild(staleBanner);
        const staleHighlight = document.createElement("div");
        staleHighlight.id = "zg-zapper-highlight";
        document.body.appendChild(staleHighlight);

        zapper.stop();

        expect(document.querySelectorAll("#zg-zapper-highlight")).toHaveLength(0);
        expect(document.querySelectorAll("#zg-zapper-banner")).toHaveLength(0);
    });

    it("does not zap stale Zapper UI nodes", async () => {
        const onSaveRule = jest.fn<(selector: string) => void>();
        const zapper = new Zapper({
            onSaveRule,
            onReapply: () => {},
            showToast: () => {},
        });
        zapper.start();

        const staleBanner = document.createElement("div");
        staleBanner.id = "zg-zapper-banner";
        const staleButton = document.createElement("button");
        staleButton.id = "zg-zapper-exit-btn";
        staleButton.textContent = "Exit";
        staleBanner.appendChild(staleButton);
        document.body.appendChild(staleBanner);

        staleButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await Promise.resolve();

        expect(onSaveRule).not.toHaveBeenCalled();
        expect(staleButton.classList.contains("zg-zapped-temp")).toBe(false);
    });

    it("undoes against the matched hiding-rule bucket", async () => {
        (getSync as any).mockResolvedValue({
            customHidingRules: {
                "localhost": [
                    { value: ".paywall", enabled: true },
                ],
            },
        });

        const onReapply = jest.fn();
        const zapper = new Zapper({
            onSaveRule: async () => {},
            onReapply,
            showToast: () => {},
        });

        (zapper as any).undoStack.push({
            element: document.body,
            selector: ".paywall",
        });

        await (zapper as any).undo();

        expect(setSync).toHaveBeenCalledWith({
            customHidingRules: {},
        });
        expect(onReapply).toHaveBeenCalled();
    });
});
