import { jest } from "@jest/globals";

const hideElementWithAi = jest.fn() as jest.Mock;

jest.unstable_mockModule("../../src/js/shared/runtime_messages", () => ({
    hideElementWithAi,
}));

const { AiHider } = await import("../../src/js/content/modules/AiHider");

describe("AiHider", () => {
    beforeEach(() => {
        hideElementWithAi.mockReset();
        document.body.innerHTML = "";
        document.head.innerHTML = "";

        (globalThis as { chrome?: typeof chrome }).chrome = {
            runtime: {
                getURL: (path: string) => `chrome-extension://zenithguard/${path}`,
            },
        } as unknown as typeof chrome;
    });

    it("removes the keydown listener when closed without using Escape", () => {
        const addSpy = jest.spyOn(document, "addEventListener");
        const removeSpy = jest.spyOn(document, "removeEventListener");
        const onPreview = jest.fn<(selector: string | null) => void>();

        const aiHider = new AiHider();
        aiHider.start({
            onApply: async () => {},
            onPreview,
            context: { tag: "div", text: "newsletter modal" },
        });

        expect(document.getElementById("zenithguard-ai-hider-overlay")).not.toBeNull();
        expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { once: true });

        aiHider.close();

        expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
        expect(onPreview).toHaveBeenCalledWith(null);
        expect(document.getElementById("zenithguard-ai-hider-overlay")).toBeNull();
    });

    it("previews generated selectors in the local frame", async () => {
        (hideElementWithAi as any).mockResolvedValue({ selector: ".newsletter-modal" });
        const onPreview = jest.fn<(selector: string | null) => void>();

        const aiHider = new AiHider();
        aiHider.start({
            onApply: async () => {},
            onPreview,
            context: { tag: "div", text: "newsletter modal" },
        });

        const submitButton = document.getElementById("zenithguard-ai-hider-submit") as HTMLButtonElement;
        submitButton.click();
        await Promise.resolve();
        await Promise.resolve();

        const previewButton = document.getElementById("zenithguard-ai-hider-preview-btn") as HTMLButtonElement;
        previewButton.click();
        expect(onPreview).toHaveBeenCalledWith(".newsletter-modal");

        previewButton.click();
        expect(onPreview).toHaveBeenCalledWith(null);
    });
});
