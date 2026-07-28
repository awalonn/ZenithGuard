function isRedditHostname(hostname: string): boolean {
    return hostname === "reddit.com" || hostname.endsWith(".reddit.com");
}

function isElementVisibleEnough(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth;
}

export class RedditMediaGuard {
    private videoObserver: IntersectionObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    private observedVideos = new WeakSet<HTMLVideoElement>();
    private pausedByGuard = new WeakSet<HTMLVideoElement>();
    private userPausedVideos = new WeakSet<HTMLVideoElement>();
    private scanTimeout: number | null = null;

    constructor(private readonly getHostname: () => string = () => window.location.hostname) {}

    start(): void {
        if (!isRedditHostname(this.getHostname()) || this.videoObserver || !("IntersectionObserver" in window)) {
            return;
        }

        this.videoObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.target instanceof HTMLVideoElement) {
                    this.handleVisibility(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.15);
                }
            }
        }, {
            root: null,
            rootMargin: "320px 0px",
            threshold: [0, 0.15, 0.5],
        });

        this.scanVideos();
        this.startMutationObserver();
    }

    stop(): void {
        this.videoObserver?.disconnect();
        this.videoObserver = null;
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;
        if (this.scanTimeout) {
            window.clearTimeout(this.scanTimeout);
            this.scanTimeout = null;
        }
        this.observedVideos = new WeakSet<HTMLVideoElement>();
        this.pausedByGuard = new WeakSet<HTMLVideoElement>();
        this.userPausedVideos = new WeakSet<HTMLVideoElement>();
    }

    private startMutationObserver(): void {
        const root = document.documentElement || document.body;
        if (!root || this.mutationObserver) {
            return;
        }

        this.mutationObserver = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => this.nodeMayContainVideo(node)))) {
                this.scheduleScan();
            }
        });
        this.mutationObserver.observe(root, { childList: true, subtree: true });
    }

    private scheduleScan(): void {
        if (this.scanTimeout) {
            return;
        }

        this.scanTimeout = window.setTimeout(() => {
            this.scanTimeout = null;
            this.scanVideos();
        }, 250);
    }

    private scanVideos(): void {
        for (const video of Array.from(document.querySelectorAll("video"))) {
            this.observeVideo(video);
        }
    }

    private observeVideo(video: HTMLVideoElement): void {
        if (this.observedVideos.has(video) || !this.videoObserver) {
            return;
        }

        this.observedVideos.add(video);
        video.addEventListener("pause", () => {
            if (!this.pausedByGuard.has(video)) {
                this.userPausedVideos.add(video);
            }
        }, true);
        video.addEventListener("play", () => {
            if (isElementVisibleEnough(video)) {
                this.userPausedVideos.delete(video);
            }
        }, true);
        this.videoObserver.observe(video);
    }

    private handleVisibility(video: HTMLVideoElement, isNearViewport: boolean): void {
        if (!isNearViewport) {
            if (!video.paused) {
                this.pausedByGuard.add(video);
                video.pause();
            }
            return;
        }

        if (!this.pausedByGuard.has(video) || this.userPausedVideos.has(video)) {
            return;
        }

        this.pausedByGuard.delete(video);
        void video.play().catch(() => {
            // Browser autoplay policy can reject resume. Keep Reddit usable and quiet.
        });
    }

    private nodeMayContainVideo(node: Node): boolean {
        return node instanceof HTMLVideoElement
            || node instanceof Element && node.querySelector("video") !== null;
    }
}
