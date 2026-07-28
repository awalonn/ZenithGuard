import { jest } from "@jest/globals";
import { findInspectorAssociatedRequests, Inspector } from "../../src/js/content/modules/Inspector";

describe("Inspector request association", () => {
    beforeEach(() => {
        (globalThis as { CSS?: { escape: (value: string) => string } }).CSS = {
            escape: (value: string) => value,
        };
        document.body.innerHTML = "";
        document.head.innerHTML = "";
    });

    it("does not treat www/apex variants of the current site as third-party associated requests", () => {
        const requests = findInspectorAssociatedRequests(
            [
                {
                    url: "https://www.washingtonpost.com/path/to/script.js",
                    status: "allowed",
                },
                {
                    url: "https://cdn.example.net/tracker.js",
                    status: "blocked",
                },
            ],
            "washingtonpost.com",
            '<div data-src="https://www.washingtonpost.com/path/to/script.js"></div><div class="cdn example tracker"></div>',
            null,
            "https://washingtonpost.com/article",
        );

        expect(requests).toEqual([
            {
                url: "https://cdn.example.net/tracker.js",
                status: "blocked",
            },
        ]);
    });

    it("dedupes associated requests across www/apex variants of the same third-party host", () => {
        const requests = findInspectorAssociatedRequests(
            [
                {
                    url: "https://example-cdn.com/script.js",
                    status: "allowed",
                },
                {
                    url: "https://www.example-cdn.com/pixel.js",
                    status: "blocked",
                },
            ],
            "news.example.com",
            '<div class="example-cdn widget"></div>',
            null,
            "https://news.example.com/article",
        );

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe("https://example-cdn.com/script.js");
    });

    it("refreshes the network log on hover once the cached snapshot is stale", async () => {
        document.body.innerHTML = '<div id="target">Paywall</div>';
        document.head.innerHTML = "";

        const loadNetworkLog = jest.fn<() => Promise<Array<{ url: string; status: string }>>>()
            .mockResolvedValue([
                {
                    url: "https://tracker.example/pixel.js",
                    status: "blocked",
                },
            ]);

        const nowSpy = jest.spyOn(Date, "now");
        nowSpy.mockReturnValue(1000);

        const inspector = new Inspector({
            onSaveRule: async () => {},
            loadNetworkLog,
            showToast: () => {},
        });

        inspector.start();
        await Promise.resolve();

        const target = document.getElementById("target") as HTMLElement;
        const event = new MouseEvent("mouseover", { bubbles: true });
        Object.defineProperty(event, "target", { value: target });

        nowSpy.mockReturnValue(1100);
        await (inspector as any).refreshHoverTarget(event);
        expect(loadNetworkLog).toHaveBeenCalledTimes(1);

        nowSpy.mockReturnValue(3000);
        await (inspector as any).refreshHoverTarget(event);
        expect(loadNetworkLog).toHaveBeenCalledTimes(2);

        inspector.stop();
        nowSpy.mockRestore();
    });

    it("removes stale Inspector UI before mounting a new HUD", () => {
        const staleHighlight = document.createElement("div");
        staleHighlight.id = "zg-inspector-highlight";
        const staleHud = document.createElement("div");
        staleHud.id = "zg-inspector-hud";
        staleHud.textContent = "old inspector";
        document.body.appendChild(staleHighlight);
        document.body.appendChild(staleHud);

        const inspector = new Inspector({
            onSaveRule: async () => {},
            showToast: () => {},
        });

        inspector.start();

        expect(document.querySelectorAll("#zg-inspector-highlight")).toHaveLength(1);
        expect(document.querySelectorAll("#zg-inspector-hud")).toHaveLength(1);
        expect(document.getElementById("zg-inspector-hud")?.textContent).not.toBe("old inspector");
    });

    it("removes all stale Inspector UI nodes on stop", () => {
        const inspector = new Inspector({
            onSaveRule: async () => {},
            showToast: () => {},
        });

        inspector.start();

        const staleHud = document.createElement("div");
        staleHud.id = "zg-inspector-hud";
        document.body.appendChild(staleHud);
        const staleHighlight = document.createElement("div");
        staleHighlight.id = "zg-inspector-highlight";
        document.body.appendChild(staleHighlight);

        inspector.stop();

        expect(document.querySelectorAll("#zg-inspector-highlight")).toHaveLength(0);
        expect(document.querySelectorAll("#zg-inspector-hud")).toHaveLength(0);
    });

    it("does not select stale Inspector UI as a hover target", async () => {
        const inspector = new Inspector({
            onSaveRule: async () => {},
            showToast: () => {},
        });
        inspector.start();

        const staleHud = document.createElement("div");
        staleHud.id = "zg-inspector-hud";
        staleHud.textContent = "stale";
        document.body.appendChild(staleHud);

        const event = new MouseEvent("mouseover", { bubbles: true });
        Object.defineProperty(event, "target", { value: staleHud });

        await (inspector as any).refreshHoverTarget(event);

        expect((inspector as any).currentElement).toBeNull();
        expect((inspector as any).highlight?.style.display).toBe("none");
    });
});
