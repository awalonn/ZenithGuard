import { jest } from "@jest/globals";
import { RedditMediaGuard } from "../../src/js/content/modules/RedditMediaGuard";

type IntersectionCallback = IntersectionObserverCallback;

class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    readonly observed: Element[] = [];

    constructor(private readonly callback: IntersectionCallback) {
        MockIntersectionObserver.instances.push(this);
    }

    observe(element: Element): void {
        this.observed.push(element);
    }

    disconnect(): void {
        this.observed.length = 0;
    }

    unobserve(element: Element): void {
        const index = this.observed.indexOf(element);
        if (index >= 0) {
            this.observed.splice(index, 1);
        }
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    emit(target: Element, isIntersecting: boolean, intersectionRatio: number): void {
        this.callback([{
            target,
            isIntersecting,
            intersectionRatio,
            time: 0,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
        } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
}

function makeVideo(pausedInitially = false): HTMLVideoElement & {
    play: jest.Mock<() => Promise<void>>;
    pause: jest.Mock<() => void>;
} {
    const video = document.createElement("video") as HTMLVideoElement & {
        play: jest.Mock<() => Promise<void>>;
        pause: jest.Mock<() => void>;
    };
    let paused = pausedInitially;

    Object.defineProperty(video, "paused", {
        configurable: true,
        get: () => paused,
    });
    video.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 20, left: 20, right: 340, bottom: 220, width: 320, height: 200, toJSON: () => ({}),
    }) as DOMRect;
    video.pause = jest.fn<() => void>(() => {
        paused = true;
        video.dispatchEvent(new Event("pause"));
    });
    video.play = jest.fn<() => Promise<void>>(() => {
        paused = false;
        video.dispatchEvent(new Event("play"));
        return Promise.resolve();
    });

    return video;
}

describe("RedditMediaGuard", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        MockIntersectionObserver.instances = [];
        (window as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver = MockIntersectionObserver;
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1365 });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    });

    it("does not start on non-Reddit pages", () => {
        const guard = new RedditMediaGuard(() => "example.com");

        guard.start();

        expect(MockIntersectionObserver.instances).toHaveLength(0);
    });

    it("pauses offscreen Reddit videos and resumes guard-paused videos near the viewport", async () => {
        const video = makeVideo(false);
        document.body.appendChild(video);
        const guard = new RedditMediaGuard(() => "www.reddit.com");

        guard.start();
        const observer = MockIntersectionObserver.instances[0];

        expect(observer.observed).toContain(video);

        observer.emit(video, false, 0);
        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(video.paused).toBe(true);

        observer.emit(video, true, 0.5);
        await Promise.resolve();

        expect(video.play).toHaveBeenCalledTimes(1);
        expect(video.paused).toBe(false);
    });

    it("does not resume videos the user paused manually", async () => {
        const video = makeVideo(true);
        document.body.appendChild(video);
        const guard = new RedditMediaGuard(() => "reddit.com");

        guard.start();
        video.dispatchEvent(new Event("pause"));
        MockIntersectionObserver.instances[0].emit(video, true, 0.5);
        await Promise.resolve();

        expect(video.play).not.toHaveBeenCalled();
    });

    it("observes videos inserted after startup without rescanning immediately for unrelated nodes", async () => {
        const guard = new RedditMediaGuard(() => "www.reddit.com");
        guard.start();
        const observer = MockIntersectionObserver.instances[0];

        const card = document.createElement("article");
        card.className = "post-card";
        document.body.appendChild(card);
        await Promise.resolve();
        jest.advanceTimersByTime(250);
        expect(observer.observed).toHaveLength(0);

        const wrapper = document.createElement("div");
        const video = makeVideo(false);
        wrapper.appendChild(video);
        document.body.appendChild(wrapper);
        await Promise.resolve();
        jest.advanceTimersByTime(250);

        expect(observer.observed).toContain(video);
    });
});
