import { hostnamesMatch } from "../../shared/hostname_matching";
import { isGoogleIdentityHostname, isGoogleIdentityUrl } from "../../shared/google_identity";
import { getLocal, setLocal } from "../../shared/storage_api";

type PopupGuardOptions = {
    getHostname?: () => string;
    getHref?: () => string;
    now?: () => number;
    isTrustedEvent?: (event: Event) => boolean;
};

type ToolActivityLogEntry = {
    tool: string;
    title: string;
    message: string;
    tone: "info" | "success" | "error";
    timestamp: number;
    domain?: string;
};

const TRUSTED_GESTURE_WINDOW_MS = 1_500;
const PLAYER_GESTURE_WINDOW_MS = 2_000;
const ACTIVITY_RATE_LIMIT_MS = 1_000;
const PLAYER_CONTROL_SELECTOR = [
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

function normalizeActivityHostname(hostname: string): string {
    const normalized = String(hostname || "").trim().toLowerCase();
    return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

export class PopupGuard {
    private originalOpen: typeof window.open | null = null;
    private lastTrustedGestureAt = 0;
    private lastPlayerGestureAt = 0;
    private lastExplicitLinkGestureAt = 0;
    private lastActivityAt = 0;
    private readonly getHostname: () => string;
    private readonly getHref: () => string;
    private readonly now: () => number;
    private readonly isTrustedEvent: (event: Event) => boolean;

    constructor(options: PopupGuardOptions = {}) {
        this.getHostname = options.getHostname || (() => window.location.hostname);
        this.getHref = options.getHref || (() => window.location.href);
        this.now = options.now || (() => Date.now());
        this.isTrustedEvent = options.isTrustedEvent || ((event) => event.isTrusted);
    }

    start(): void {
        if (this.originalOpen) {
            return;
        }

        this.dispatchPageGuardState(true);
        this.originalOpen = window.open.bind(window);
        window.open = ((url?: string | URL, target?: string, features?: string) => {
            if (this.shouldBlockOpen(url)) {
                void this.recordBlockedPopup(url);
                return null;
            }

            return this.originalOpen?.(url, target, features) || null;
        }) as typeof window.open;

        document.addEventListener("pointerdown", this.handleTrustedPointer, true);
        document.addEventListener("mousedown", this.handleTrustedPointer, true);
        document.addEventListener("click", this.handleTrustedPointer, true);
        document.addEventListener("keydown", this.handleTrustedKey, true);
        window.addEventListener("__ZENITHGUARD_POPUP_BLOCKED__", this.handlePageGuardBlocked);
    }

    stop(): void {
        this.dispatchPageGuardState(false);

        if (this.originalOpen) {
            window.open = this.originalOpen;
            this.originalOpen = null;
        }

        document.removeEventListener("pointerdown", this.handleTrustedPointer, true);
        document.removeEventListener("mousedown", this.handleTrustedPointer, true);
        document.removeEventListener("click", this.handleTrustedPointer, true);
        document.removeEventListener("keydown", this.handleTrustedKey, true);
        window.removeEventListener("__ZENITHGUARD_POPUP_BLOCKED__", this.handlePageGuardBlocked);
        this.lastTrustedGestureAt = 0;
        this.lastPlayerGestureAt = 0;
        this.lastExplicitLinkGestureAt = 0;
    }

    private dispatchPageGuardState(enabled: boolean): void {
        window.dispatchEvent(new CustomEvent("__ZENITHGUARD_POPUP_GUARD_STATE__", {
            detail: { enabled },
        }));
    }

    private readonly handleTrustedPointer = (event: Event): void => {
        if (!this.isTrustedEvent(event)) {
            return;
        }

        const timestamp = this.now();
        this.lastTrustedGestureAt = timestamp;

        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }

        if (target.closest("a[href]")) {
            this.lastExplicitLinkGestureAt = timestamp;
            return;
        }

        if (target.closest(PLAYER_CONTROL_SELECTOR)) {
            this.lastPlayerGestureAt = timestamp;
        }
    };

    private readonly handleTrustedKey = (event: Event): void => {
        if (this.isTrustedEvent(event)) {
            this.lastTrustedGestureAt = this.now();
        }
    };

    private shouldBlockOpen(url?: string | URL): boolean {
        const timestamp = this.now();
        const hasTrustedGesture = timestamp - this.lastTrustedGestureAt <= TRUSTED_GESTURE_WINDOW_MS;
        if (!hasTrustedGesture) {
            return true;
        }

        if (isGoogleIdentityUrl(url, this.getHref())) {
            return false;
        }

        if (timestamp - this.lastExplicitLinkGestureAt <= PLAYER_GESTURE_WINDOW_MS) {
            return false;
        }

        const destinationHostname = this.getDestinationHostname(url);
        if (!destinationHostname) {
            return !isGoogleIdentityHostname(this.getHostname());
        }

        return !hostnamesMatch(this.getHostname(), destinationHostname);
    }

    private readonly handlePageGuardBlocked = (event: Event): void => {
        const detail = (event as CustomEvent<{ url?: string }>).detail;
        void this.recordBlockedPopup(detail?.url);
    };

    private getDestinationHostname(url?: string | URL): string | null {
        const value = String(url || "").trim();
        if (!value || value === "about:blank") {
            return null;
        }

        try {
            const parsed = new URL(value, this.getHref());
            return parsed.protocol === "http:" || parsed.protocol === "https:"
                ? parsed.hostname.toLowerCase()
                : null;
        } catch {
            return null;
        }
    }

    private async recordBlockedPopup(url?: string | URL): Promise<void> {
        const timestamp = this.now();
        if (timestamp - this.lastActivityAt < ACTIVITY_RATE_LIMIT_MS) {
            return;
        }
        this.lastActivityAt = timestamp;

        try {
            const destination = String(url || "blank popup").slice(0, 160);
            const snapshot = await getLocal<{ toolActivityLog?: ToolActivityLogEntry[] }>("toolActivityLog");
            const current = snapshot && Array.isArray(snapshot.toolActivityLog) ? snapshot.toolActivityLog : [];
            await setLocal({
                toolActivityLog: [
                    {
                        tool: "Popup Guard",
                        title: "Popup Blocked",
                        message: `Blocked a forced popup to ${destination}.`,
                        tone: "success",
                        timestamp,
                        domain: normalizeActivityHostname(this.getHostname()),
                    },
                    ...current,
                ].slice(0, 25),
            });
        } catch {
            // Keep page interaction quiet if storage is unavailable.
        }
    }
}
