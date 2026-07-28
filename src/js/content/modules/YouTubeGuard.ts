export class YouTubeGuard {
    private static instance: YouTubeGuard | null = null;
    private observer: MutationObserver | null = null;
    private adObserver: MutationObserver | null = null;
    private debounceTimeout: number | null = null;
    private reapplyCallback: (() => Promise<void>) | null = null;
    private readonly isContextValid = (): boolean => Boolean(chrome.runtime?.id);
    private wasAdPlaying = false;

    static getInstance(): YouTubeGuard {
        if (!YouTubeGuard.instance) {
            YouTubeGuard.instance = new YouTubeGuard();
        }

        return YouTubeGuard.instance;
    }

    init(reapplyCallback: () => Promise<void>): void {
        if (window.location.hostname !== "www.youtube.com") {
            return;
        }

        this.reapplyCallback = reapplyCallback;
        this.injectInterceptor();
        this.hideAdElements();
        this.startAdSkipper();

        if (document.body) {
            this.startObserver();
        } else {
            window.addEventListener("DOMContentLoaded", () => this.startObserver(), { once: true });
        }
    }

    stop(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.adObserver?.disconnect();
        this.adObserver = null;
        if (this.debounceTimeout) {
            window.clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        document.getElementById("zenithguard-youtube-cosmetic-styles")?.remove();
    }

    private startObserver(): void {
        this.injectInterceptor();
        this.hideAdElements();

        this.observer = new MutationObserver(() => {
            if (!this.isContextValid()) {
                this.stop();
                return;
            }

            if (this.debounceTimeout) {
                window.clearTimeout(this.debounceTimeout);
            }

            this.debounceTimeout = window.setTimeout(async () => {
                if (!this.isContextValid()) {
                    return;
                }

                if (this.reapplyCallback) {
                    await this.reapplyCallback();
                }

                this.hideAdElements();
                this.injectInterceptor();
            }, 200);
        });

        if (document.body) {
            this.observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    private injectInterceptor(): void {
        if (!this.isContextValid() || document.getElementById("zenithguard-yt-interceptor")) {
            return;
        }

        try {
            const script = document.createElement("script");
            script.id = "zenithguard-yt-interceptor";
            script.src = chrome.runtime.getURL("js/yt_interceptor.js");
            (document.head || document.documentElement).appendChild(script);
            script.onload = () => {
                script.remove();
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes("context invalidated")) {
                console.error("ZenithGuard: Error injecting yt_interceptor:", error);
            }
        }
    }

    private hideAdElements(): void {
        const styleId = "zenithguard-youtube-cosmetic-styles";
        let style = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
        }

        const hiddenSelectors = [
            ".ytp-ad-image-overlay",
            ".ytp-ad-text-overlay",
            "ytd-promoted-sparkles-web-renderer",
            "ytd-display-ad-renderer",
            "ytd-promoted-video-renderer",
            "ytd-in-feed-ad-layout-renderer",
            "ytd-ad-slot-renderer",
            "ytd-promoted-sparkles-text-search-renderer",
            ".ytp-ad-preview-container",
            ".ytp-ad-overlay-container",
            "#player-ads",
            "#masthead-ad",
            ".ytp-paid-content-overlay",
            "ytd-banner-promo-renderer",
            "ytd-action-companion-ad-renderer",
            ".ytp-ad-action-interstitial",
            ".ytp-ad-visit-advertiser-button",
            "ytd-merch-shelf-renderer",
            "ytd-in-stream-ad-layout-renderer",
        ];

        const visibleSkipSelectors = [
            ".ytp-ad-skip-button",
            ".ytp-ad-skip-button-modern",
            ".videoAdUiSkipButton",
            ".ytp-ad-skip-button-container",
            ".ytp-ad-skip-button-slot",
            "button.ytp-ad-skip-button-text",
        ];

        style.textContent = `${hiddenSelectors.join(", ")} { display: none !important; }
${visibleSkipSelectors.join(", ")} {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
}`;
    }

    private static readonly SKIP_SELECTORS = [
        ".ytp-ad-skip-button",
        ".ytp-ad-skip-button-modern",
        ".ytp-skip-ad-button",
        ".videoAdUiSkipButton",
        ".ytp-ad-skip-button-container button",
        ".ytp-ad-skip-button-slot button",
        "button.ytp-ad-skip-button-text",
        'button[class*="skip"]',
    ];

    private startAdSkipper(): void {
        const attach = (): void => {
            const player = document.querySelector(".html5-video-player");
            if (player) {
                this.attachAdObserver(player);
                return;
            }

            const waitObserver = new MutationObserver(() => {
                const nextPlayer = document.querySelector(".html5-video-player");
                if (nextPlayer) {
                    waitObserver.disconnect();
                    this.attachAdObserver(nextPlayer);
                }
            });

            const root = document.body || document.documentElement;
            waitObserver.observe(root, { childList: true, subtree: true });
        };

        if (document.body) {
            attach();
        } else {
            window.addEventListener("DOMContentLoaded", attach, { once: true });
        }
    }

    private attachAdObserver(player: Element): void {
        this.adObserver = new MutationObserver(() => {
            if (!this.isContextValid()) {
                this.adObserver?.disconnect();
                return;
            }

            this.handleAdState(player);
        });

        this.adObserver.observe(player, { attributes: true, attributeFilter: ["class"] });

        const intervalId = window.setInterval(() => {
            if (!this.isContextValid()) {
                window.clearInterval(intervalId);
                return;
            }

            if (window.ZenithGuard_ProtectionEnabled) {
                this.handleAdState(player);
            }
        }, 500);

        this.handleAdState(player);
    }

    private handleAdState(player: Element): void {
        if (!window.ZenithGuard_ProtectionEnabled) {
            return;
        }

        const video = player.querySelector("video");
        if (!video) {
            return;
        }

        const htmlVideo = video as HTMLVideoElement;
        if (
            player.classList.contains("ad-interrupting")
            || player.classList.contains("ad-showing")
            || player.classList.contains("ytp-ad-player-overlay-showing")
        ) {
            this.wasAdPlaying = true;

            for (const selector of YouTubeGuard.SKIP_SELECTORS) {
                const button = document.querySelector(selector) as HTMLElement | null;
                if (button && button.offsetParent !== null) {
                    button.click();
                    return;
                }
            }

            const closeButton = document.querySelector(".ytp-ad-overlay-close-button") as HTMLElement | null;
            closeButton?.click();
            htmlVideo.muted = true;
            htmlVideo.playbackRate = 16;
            if (!Number.isNaN(htmlVideo.duration) && htmlVideo.duration > 0) {
                htmlVideo.currentTime = htmlVideo.duration;
            }

            window.setTimeout(() => {
                for (const selector of YouTubeGuard.SKIP_SELECTORS) {
                    const button = document.querySelector(selector) as HTMLElement | null;
                    if (button) {
                        button.click();
                        break;
                    }
                }
            }, 50);
            return;
        }

        if (this.wasAdPlaying) {
            this.wasAdPlaying = false;
            htmlVideo.muted = false;
            htmlVideo.playbackRate = 1;
        }
    }
}
