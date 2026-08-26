import { NextGenCleaner } from "../../src/js/content/modules/NextGenCleaner";

describe("NextGenCleaner", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("handles elements whose reflected id property is not a string", async () => {
        const cleaner = new NextGenCleaner();
        cleaner.start();

        const element = document.createElement("div");
        element.setAttribute("class", "adskeeper-widget");
        Object.defineProperty(element, "id", {
            configurable: true,
            value: { baseVal: "" },
        });

        document.body.appendChild(element);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(element.style.getPropertyValue("display")).toBe("none");
        expect(element.style.getPropertyPriority("display")).toBe("important");

        cleaner.stop();
    });

    it("cleans matching elements already present when started", () => {
        document.body.innerHTML = '<div class="MGID-display-box"></div>';
        const element = document.querySelector(".MGID-display-box") as HTMLElement;

        const cleaner = new NextGenCleaner();
        cleaner.start();

        expect(element.style.getPropertyValue("display")).toBe("none");
        cleaner.stop();
    });

    it("cleans matching descendants inside an inserted wrapper", async () => {
        const cleaner = new NextGenCleaner();
        cleaner.start();

        const wrapper = document.createElement("section");
        wrapper.innerHTML = '<div><aside id="adskeeper-late-widget"></aside></div>';
        const widget = wrapper.querySelector("aside") as HTMLElement;
        document.body.appendChild(wrapper);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(widget.style.getPropertyValue("display")).toBe("none");
        cleaner.stop();
    });

    it("uses CSS instead of observing every class change for late marker assignments", async () => {
        const cleaner = new NextGenCleaner();
        cleaner.start();

        const element = document.createElement("div");
        document.body.appendChild(element);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        element.className = "mgid-dynamic-slot";
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(window.getComputedStyle(element).display).toBe("none");
        cleaner.stop();
    });

    it("does not clean extension-owned class tokens", async () => {
        const cleaner = new NextGenCleaner();
        cleaner.start();

        const element = document.createElement("div");
        element.className = "tool mgid-preview zg-overlay";
        document.body.appendChild(element);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(element.style.getPropertyValue("display")).toBe("");
        cleaner.stop();
    });
});
