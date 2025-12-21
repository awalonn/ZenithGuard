
import { HidingRule } from '../../types.js'; // Assuming types are accessible, might need adjustment

export class YouTubeProtector {
    private static instance: YouTubeProtector;
    private observer: MutationObserver | null = null;
    private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    public reapplyCallback: ((isInitial: boolean) => Promise<void>) | null = null;

    private constructor() { }

    public static getInstance(): YouTubeProtector {
        if (!YouTubeProtector.instance) {
            YouTubeProtector.instance = new YouTubeProtector();
        }
        return YouTubeProtector.instance;
    }

    public init(reapplyCallback: (isInitial: boolean) => Promise<void>) {
        if (window.location.hostname !== 'www.youtube.com') return;

        this.reapplyCallback = reapplyCallback;

        // CRITICAL: Inject interceptors IMMEDIATELY (at document_start)
        this.injectInterceptor();
        this.hideAdElements();
        this.startNuclearSkipper();

        if (!document.body) {
            window.addEventListener('DOMContentLoaded', () => this.startObserver(), { once: true });
        } else {
            this.startObserver();
        }
    }

    private startObserver() {
        // Idempotent checks
        this.injectInterceptor();
        this.hideAdElements();

        this.observer = new MutationObserver((mutations) => {
            if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(async () => {
                if (this.reapplyCallback) await this.reapplyCallback(false);
                this.hideAdElements();
                this.injectInterceptor();
            }, 200);
        });

        if (document.body) {
            this.observer.observe(document.body, { childList: true, subtree: true });
            console.log("ZenithGuard: YouTube Protector Active (Modular).");
        }
    }

    private injectInterceptor() {
        if (document.getElementById('zenithguard-yt-interceptor')) return;
        try {
            const script = document.createElement('script');
            script.id = 'zenithguard-yt-interceptor';
            script.src = chrome.runtime.getURL('js/yt_interceptor.js');
            console.log(`ZenithGuard: Injecting interceptor from ${script.src}`);
            (document.head || document.documentElement).appendChild(script);
            script.onload = () => {
                console.log('ZenithGuard: yt_interceptor.js loaded successfully');
                script.remove();
            };
            script.onerror = (e) => {
                console.error('ZenithGuard: Failed to load yt_interceptor.js', e);
            };
        } catch (e) {
            console.error('ZenithGuard: Error injecting yt_interceptor:', e);
        }
    }

    private hideAdElements() {
        const styleId = 'zenithguard-youtube-cosmetic-styles';
        let styleSheet = document.getElementById(styleId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        }

        const hideSelectors = [
            '.video-ads', '.ytp-ad-player-overlay', '.ytp-ad-player-overlay-layout',
            '.ytp-ad-image-overlay', '.ytp-ad-text-overlay',
            'ytd-promoted-sparkles-web-renderer', 'ytd-display-ad-renderer',
            'ytd-promoted-video-renderer', 'ytd-in-feed-ad-layout-renderer',
            'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-text-search-renderer',
            '.ytp-ad-preview-container', '.ytp-ad-overlay-container',
            '#player-ads', '#masthead-ad', '.ytp-paid-content-overlay',
            'ytd-banner-promo-renderer', 'ytd-action-companion-ad-renderer'
        ];

        const showSelectors = [
            '.ytp-ad-skip-button',
            '.ytp-ad-skip-button-modern',
            '.videoAdUiSkipButton',
            '.ytp-ad-skip-button-container',
            '.ytp-ad-module'
        ];

        const hideCss = `${hideSelectors.join(', ')} { display: none !important; }`;
        const showCss = `
            ${showSelectors.join(', ')} { 
                display: block !important; 
                visibility: visible !important; 
                opacity: 1 !important; 
                z-index: 2147483647 !important; 
                pointer-events: auto !important;
            }
        `;

        styleSheet.textContent = hideCss + showCss;
    }

    private startNuclearSkipper() {
        setInterval(() => {
            // 1. Aggressively click ANY skip button variant
            const skipSelectors = [
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
                '.ytp-skip-ad-button',
                '.videoAdUiSkipButton',
                '.ytp-ad-skip-button-container button',
                'button[class*="skip"]'
            ];

            for (const selector of skipSelectors) {
                const btn = document.querySelector(selector) as HTMLElement;
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    console.log('ZenithGuard: Auto-clicked skip button');
                    break;
                }
            }

            // 2. Close overlay ads
            const overlayCloseBtn = document.querySelector('.ytp-ad-overlay-close-button') as HTMLElement;
            if (overlayCloseBtn) overlayCloseBtn.click();

            // 3. Nuclear video manipulation if ad is detected
            const player = document.querySelector('.html5-video-player');
            const video = document.querySelector('video') as HTMLVideoElement;

            if (player && video) {
                const isAdPlaying = player.classList.contains('ad-interrupting') ||
                    player.classList.contains('ad-showing') ||
                    player.classList.contains('ytp-ad-player-overlay-showing');

                if (isAdPlaying) {
                    console.log("ZenithGuard: Ad container detected. Fast-forwarding...");
                    video.muted = true;
                    video.playbackRate = 16;
                    if (!isNaN(video.duration) && video.duration > 0) {
                        video.currentTime = video.duration - 0.1;
                    }

                    // Force click skip after fast-forward
                    setTimeout(() => {
                        for (const selector of skipSelectors) {
                            const btn = document.querySelector(selector) as HTMLElement;
                            if (btn) btn.click();
                        }
                    }, 100);
                }
            }
        }, 25); // Poll every 25ms instead of 50ms for faster response
    }
}
