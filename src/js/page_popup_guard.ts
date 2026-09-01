import { isGoogleIdentityHostname, isGoogleIdentityUrl } from "./shared/google_identity";

(() => {
    const marker = "__zenithGuardPagePopupGuard";
    const state = window as Window & { [marker]?: boolean };
    if (state[marker]) {
        return;
    }
    state[marker] = true;

    const trustedGestureWindowMs = 1500;
    const playerGestureWindowMs = 2000;
    const playerSelector = [
        "video",
        "iframe",
        "[class*='player']",
        "[id*='player']",
        "[class*='video']",
        "[id*='video']",
        "[aria-label*='play']",
        "[aria-label*='pause']",
        "[aria-label*='fullscreen']",
        "[aria-label*='seek']",
    ].join(", ");

    let lastTrustedGestureAt = 0;
    let lastPlayerGestureAt = 0;
    let lastExplicitLinkGestureAt = 0;
    let enabled = true;

    function now(): number {
        return Date.now();
    }

    function hostnamesMatch(left: string | undefined, right: string | undefined): boolean {
        const normalizedLeft = String(left || "").trim().toLowerCase();
        const normalizedRight = String(right || "").trim().toLowerCase();
        return Boolean(normalizedLeft && normalizedRight)
            && (normalizedLeft === normalizedRight
                || normalizedLeft.endsWith(`.${normalizedRight}`)
                || normalizedRight.endsWith(`.${normalizedLeft}`));
    }

    function destinationHostname(url?: string | URL | null): string | null {
        const value = String(url || "").trim();
        if (!value || value === "about:blank") {
            return null;
        }

        try {
            const parsed = new URL(value, window.location.href);
            return parsed.protocol === "http:" || parsed.protocol === "https:"
                ? parsed.hostname.toLowerCase()
                : null;
        } catch {
            return null;
        }
    }

    function isCrossSiteOrBlank(url?: string | URL | null): boolean {
        const hostname = destinationHostname(url);
        return !hostname || !hostnamesMatch(window.location.hostname, hostname);
    }

    function emitBlocked(url: string | URL | null | undefined, reason: string): void {
        window.dispatchEvent(new CustomEvent("__ZENITHGUARD_POPUP_BLOCKED__", {
            detail: {
                url: String(url || "blank popup").slice(0, 200),
                reason,
            },
        }));
    }

    function handleGuardState(event: Event): void {
        const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
        enabled = detail?.enabled !== false;
    }

    function handleGesture(event: Event): void {
        if (!event.isTrusted) {
            return;
        }

        const timestamp = now();
        lastTrustedGestureAt = timestamp;

        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }

        if (target.closest("a[href]")) {
            lastExplicitLinkGestureAt = timestamp;
        }

        if (target.closest(playerSelector)) {
            lastPlayerGestureAt = timestamp;
        }
    }

    function handleSuspiciousAnchorClick(event: MouseEvent): void {
        if (!enabled) {
            return;
        }

        if (!event.isTrusted) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        const link = target?.closest("a[href]") as HTMLAnchorElement | null;
        if (!target || !link) {
            return;
        }

        const label = (link.textContent || link.getAttribute("aria-label") || link.title || "").replace(/\s+/g, " ").trim();
        const opensNewContext = link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
        const insidePlayer = Boolean(target.closest(playerSelector));
        const suspiciousOverlay = label.length < 3 || insidePlayer && opensNewContext;
        if (!suspiciousOverlay || !isCrossSiteOrBlank(link.href)) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        emitBlocked(link.href, insidePlayer ? "cross-site player anchor" : "cross-site overlay anchor");
    }

    const nativeOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
        if (!enabled) {
            return nativeOpen(url, target, features);
        }

        const timestamp = now();
        const hasTrustedGesture = timestamp - lastTrustedGestureAt <= trustedGestureWindowMs;
        if (!hasTrustedGesture) {
            emitBlocked(url, "no trusted gesture");
            return null;
        }

        if (
            isGoogleIdentityUrl(url, window.location.href)
            || (!destinationHostname(url) && isGoogleIdentityHostname(window.location.hostname))
        ) {
            return nativeOpen(url, target, features);
        }

        const isRecentPlayerGesture = timestamp - lastPlayerGestureAt <= playerGestureWindowMs;
        const isRecentExplicitLinkGesture = timestamp - lastExplicitLinkGestureAt <= playerGestureWindowMs;
        if (!isRecentExplicitLinkGesture && isCrossSiteOrBlank(url)) {
            emitBlocked(url, isRecentPlayerGesture ? "cross-site player popup" : "cross-site click popup");
            return null;
        }

        return nativeOpen(url, target, features);
    }) as typeof window.open;

    document.addEventListener("pointerdown", handleGesture, true);
    document.addEventListener("mousedown", handleGesture, true);
    document.addEventListener("keydown", handleGesture, true);
    document.addEventListener("click", handleSuspiciousAnchorClick, true);
    document.addEventListener("click", handleGesture, true);
    window.addEventListener("__ZENITHGUARD_POPUP_GUARD_STATE__", handleGuardState);
})();
