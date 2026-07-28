import { jest } from "@jest/globals";

import { clearProcessingToast, consumeTargetingContextMenuEvent } from "../../src/js/content/modules/tool_runtime";

describe("content tool runtime helpers", () => {
    it("clears the shared processing toast when present", () => {
        document.body.innerHTML = '<div id="zg-processing-toast">Loading…</div>';

        clearProcessingToast();

        expect(document.getElementById("zg-processing-toast")).toBeNull();
    });

    it("consumes the targeting context-menu event and returns the element target", () => {
        const target = document.createElement("div");
        const event = {
            target,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        const result = consumeTargetingContextMenuEvent(event);

        expect(result).toBe(target);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it("ignores targeting events that do not have an element target", () => {
        const event = {
            target: null,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as MouseEvent;

        const result = consumeTargetingContextMenuEvent(event);

        expect(result).toBeNull();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
    });
});
