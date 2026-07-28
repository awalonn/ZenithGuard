import type { ToastOptions } from "./toast";
import { generateUniqueSelector } from "./selector";
import { UiProtection } from "./UiProtection";
import { hostnamesMatch } from "../../shared/hostname_matching";

export type InspectorMode = "default" | "wall-recovery";

export type InspectorTargetContext = {
    tag: string;
    id?: string;
    classes?: string;
    text?: string;
};

export type InspectorOptions = {
    onSaveRule: (selector: string) => void | Promise<void>;
    onStartAiHide?: (context: InspectorTargetContext) => void;
    loadNetworkLog?: () => Promise<Array<{ url: string; status: string }>>;
    onBlockDomain?: (domain: string) => Promise<{ success?: boolean; message?: string }>;
    showToast: (options: ToastOptions) => void;
};

type AssociatedRequest = {
    url: string;
    status: string;
};

const NETWORK_LOG_REFRESH_INTERVAL_MS = 1500;
const INSPECTOR_HIGHLIGHT_ID = "zg-inspector-highlight";
const INSPECTOR_HUD_ID = "zg-inspector-hud";
const INSPECTOR_UI_SELECTOR = `#${INSPECTOR_HIGHLIGHT_ID}, #${INSPECTOR_HUD_ID}`;

function hasMatchingAssociatedRequest(
    matches: Map<string, AssociatedRequest>,
    hostname: string,
): boolean {
    return Array.from(matches.keys()).some((candidate) => hostnamesMatch(candidate, hostname));
}

export function findInspectorAssociatedRequests(
    networkLog: AssociatedRequest[],
    pageHostname: string,
    elementHtml: string,
    iframeSrc?: string | null,
    pageUrl = window.location.href,
): AssociatedRequest[] {
    if (!networkLog.length) {
        return [];
    }

    const matches = new Map<string, AssociatedRequest>();

    if (iframeSrc) {
        try {
            const iframeUrl = new URL(iframeSrc, pageUrl).href;
            const iframeRequest = networkLog.find((entry) => entry.url === iframeUrl);
            if (iframeRequest) {
                const iframeHostname = new URL(iframeRequest.url).hostname;
                if (!hostnamesMatch(iframeHostname, pageHostname)) {
                    matches.set(iframeHostname, iframeRequest);
                }
            }
        } catch {
            // Ignore iframe URL issues.
        }
    }

    for (const request of networkLog) {
        if (request.status !== "blocked" && request.status !== "allowed") {
            continue;
        }

        try {
            const hostname = new URL(request.url).hostname;
            if (hostnamesMatch(hostname, pageHostname) || hasMatchingAssociatedRequest(matches, hostname)) {
                continue;
            }

            if (elementHtml.includes(request.url.toLowerCase())) {
                matches.set(hostname, request);
                continue;
            }

            const hostnameParts = hostname.split(".").filter((part) => part !== "www" && part.length > 3);
            if (hostnameParts.some((part) => elementHtml.includes(part))) {
                matches.set(hostname, request);
            }
        } catch {
            // Ignore malformed URLs.
        }
    }

    return Array.from(matches.values());
}

export class Inspector {
    private active = false;
    private mode: InspectorMode = "default";
    private highlight: HTMLDivElement | null = null;
    private hud: HTMLDivElement | null = null;
    private currentElement: HTMLElement | null = null;
    private networkLog: AssociatedRequest[] = [];
    private lastNetworkLogLoadedAt = 0;
    private hoverTimeout: number | null = null;
    private readonly uiProtection = UiProtection.getInstance();

    constructor(private readonly options: InspectorOptions) {}

    start(mode: InspectorMode = "default"): void {
        if (this.active) {
            return;
        }

        this.active = true;
        this.mode = mode;
        void this.loadNetworkLog();
        this.mount();
        document.addEventListener("mouseover", this.handleMouseOver, true);
        document.addEventListener("keydown", this.handleKeyDown, true);
        this.options.showToast({
            message: mode === "wall-recovery"
                ? "Inspector active for wall recovery. Hover the blocker or locked article area, then use Quick Hide or Advanced Hide (AI). Press ESC to exit."
                : "Inspector active. Hover elements and use Quick Hide or Advanced Hide (AI). Press ESC to exit.",
            type: "info",
            duration: 4500,
        });
    }

    stop(): void {
        if (!this.active) {
            this.cleanupMountedUi();
            return;
        }

        this.active = false;
        document.removeEventListener("mouseover", this.handleMouseOver, true);
        document.removeEventListener("keydown", this.handleKeyDown, true);
        this.cleanupMountedUi();
        this.currentElement = null;
        if (this.hoverTimeout) {
            window.clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
        this.lastNetworkLogLoadedAt = 0;
    }

    private cleanupMountedUi(): void {
        this.uiProtection.unprotect(INSPECTOR_HIGHLIGHT_ID);
        this.uiProtection.unprotect(INSPECTOR_HUD_ID);
        document.querySelectorAll(`#${INSPECTOR_HIGHLIGHT_ID}, #${INSPECTOR_HUD_ID}`).forEach((element) => element.remove());
        this.highlight = null;
        this.hud = null;
    }

    private mount(): void {
        this.cleanupMountedUi();

        this.highlight = document.createElement("div");
        this.highlight.id = INSPECTOR_HIGHLIGHT_ID;

        this.hud = document.createElement("div");
        this.hud.id = INSPECTOR_HUD_ID;
        this.hud.innerHTML = `
            <div class="zg-hud-header">
                <div class="zg-hud-selector" title="No element selected">Hover an element</div>
                <div class="zg-hud-header-actions">
                    <button type="button" class="zg-hud-btn zg-hud-quick-hide-btn">Quick Hide</button>
                    <button type="button" class="zg-hud-btn zg-hud-ai-hide-btn">Advanced Hide (AI)</button>
                </div>
            </div>
            <div class="zg-hud-body">
                <div class="zg-hud-requests">
                    <h4>Associated Requests</h4>
                    <div class="zg-hud-request-list"></div>
                </div>
            </div>
            <div class="zg-hud-footer">
                <span class="zg-hud-exit-hint"></span>
            </div>
        `;

        const hint = this.hud.querySelector(".zg-hud-exit-hint") as HTMLDivElement | null;
        if (hint) {
            hint.textContent = this.mode === "wall-recovery"
                ? "Wall recovery mode: hover the paywall, blur layer, or locked article wrapper. Quick Hide removes simple blockers; Advanced Hide (AI) is better for tricky containers. ESC to exit."
                : "Hover to select. Use buttons to hide or block. ESC to exit.";
        }

        const quickHideButton = this.hud.querySelector(".zg-hud-quick-hide-btn") as HTMLButtonElement | null;
        const aiHideButton = this.hud.querySelector(".zg-hud-ai-hide-btn") as HTMLButtonElement | null;
        quickHideButton?.addEventListener("click", () => this.quickHide());
        aiHideButton?.addEventListener("click", () => this.startAiHide());
        this.hud.addEventListener("mouseenter", this.handleHudEnter);
        this.hud.addEventListener("click", this.handleHudClick, true);

        document.body.appendChild(this.highlight);
        document.body.appendChild(this.hud);
        this.uiProtection.protect(INSPECTOR_HIGHLIGHT_ID, () => {
            if (this.active && this.highlight && !document.getElementById(INSPECTOR_HIGHLIGHT_ID)) {
                document.body.appendChild(this.highlight);
            }
        });
        this.uiProtection.protect(INSPECTOR_HUD_ID, () => {
            if (this.active && this.hud && !document.getElementById(INSPECTOR_HUD_ID)) {
                document.body.appendChild(this.hud);
            }
        });
    }

    private isInspectorUiTarget(target: HTMLElement | null): boolean {
        return Boolean(target && (target.matches(INSPECTOR_UI_SELECTOR) || target.closest(INSPECTOR_UI_SELECTOR)));
    }

    private handleMouseOver = (event: MouseEvent): void => {
        if (!this.active) {
            return;
        }

        if (this.hoverTimeout) {
            window.clearTimeout(this.hoverTimeout);
        }

        this.hoverTimeout = window.setTimeout(() => {
            void this.refreshHoverTarget(event);
        }, 120);
    };

    private async refreshHoverTarget(event: MouseEvent): Promise<void> {
        if (!this.active) {
            return;
        }

        await this.refreshNetworkLogIfStale();

        if (!this.active) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || this.isInspectorUiTarget(target)) {
            if (this.highlight) {
                this.highlight.style.display = "none";
            }
            return;
        }

        this.currentElement = target;
        const rect = target.getBoundingClientRect();
        if (this.highlight) {
            Object.assign(this.highlight.style, {
                display: "block",
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                top: `${rect.top + window.scrollY}px`,
                left: `${rect.left + window.scrollX}px`,
            });
        }

        if (this.hud) {
            this.renderHud(target, rect);
        }
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.stop();
        }
    };

    private handleHudEnter = (): void => {
        if (this.hoverTimeout) {
            window.clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
    };

    private handleHudClick = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();

        const target = event.target as HTMLElement | null;
        if (!target) {
            return;
        }

        if (target.classList.contains("zg-hud-block-btn")) {
            void this.blockDomain(target as HTMLButtonElement);
        }
    };

    private async quickHide(): Promise<void> {
        if (!this.currentElement) {
            return;
        }

        const selector = generateUniqueSelector(this.currentElement);
        if (!selector) {
            this.options.showToast({ message: "Could not generate a unique selector.", type: "error" });
            return;
        }

        await this.options.onSaveRule(selector);
        this.options.showToast({ message: "Hiding rule saved.", type: "success" });
    }

    private startAiHide(): void {
        if (!this.currentElement || !this.options.onStartAiHide) {
            return;
        }

        this.options.onStartAiHide({
            tag: this.currentElement.tagName.toLowerCase(),
            id: this.currentElement.id || undefined,
            classes: typeof this.currentElement.className === "string" ? this.currentElement.className : undefined,
            text: this.currentElement.textContent?.trim().replace(/\s+/g, " ").slice(0, 200) || undefined,
        });
        this.stop();
    }

    private async loadNetworkLog(): Promise<void> {
        if (!this.options.loadNetworkLog) {
            this.networkLog = [];
            this.lastNetworkLogLoadedAt = Date.now();
            return;
        }

        try {
            const log = await this.options.loadNetworkLog();
            this.networkLog = Array.isArray(log) ? log : [];
        } catch {
            this.networkLog = [];
        }

        this.lastNetworkLogLoadedAt = Date.now();
    }

    private async refreshNetworkLogIfStale(): Promise<void> {
        if (!this.options.loadNetworkLog) {
            return;
        }

        if (Date.now() - this.lastNetworkLogLoadedAt < NETWORK_LOG_REFRESH_INTERVAL_MS) {
            return;
        }

        await this.loadNetworkLog();
    }

    private renderHud(element: HTMLElement, rect: DOMRect): void {
        if (!this.hud) {
            return;
        }

        const top = rect.top + window.scrollY - this.hud.offsetHeight - 5;
        const left = rect.left + window.scrollX;
        this.hud.style.top = `${top < 0 ? rect.bottom + window.scrollY + 5 : top}px`;
        this.hud.style.left = `${Math.max(0, Math.min(window.innerWidth - this.hud.offsetWidth, left))}px`;

        const selector = generateUniqueSelector(element) || "...";
        const selectorLabel = this.hud.querySelector(".zg-hud-selector") as HTMLDivElement | null;
        if (selectorLabel) {
            selectorLabel.textContent = selector;
            selectorLabel.title = selector;
        }

        const requestList = this.hud.querySelector(".zg-hud-request-list") as HTMLDivElement | null;
        if (!requestList) {
            return;
        }

        const requests = this.findAssociatedRequests(element);
        if (requests.length > 0) {
            requestList.innerHTML = requests.map((request) => {
                let domain = request.url;
                try {
                    domain = new URL(request.url).hostname;
                } catch {
                    // Keep raw URL fallback.
                }
                const blocked = request.status === "blocked";
                return `
                    <div class="zg-hud-request-item" title="${request.url}">
                        <span class="domain">${domain}</span>
                        <button class="zg-hud-btn zg-hud-block-btn" data-domain="${domain}" ${blocked ? "disabled" : ""}>
                            ${blocked ? "Blocked" : "Block"}
                        </button>
                    </div>
                `;
            }).join("");
            return;
        }

        const interactive = ["button", "a", "input", "select", "textarea"].includes(element.tagName.toLowerCase())
            || element.hasAttribute("onclick")
            || element.getAttribute("role") === "button";

        let emptyState = '<div class="zg-hud-no-requests">No direct network requests found for this element.</div>';
        if (interactive) {
            emptyState += '<div class="zg-hud-script-note">Note: Actions on this element may be handled by page-level scripts.</div>';
        }
        requestList.innerHTML = emptyState;
    }

    private findAssociatedRequests(element: HTMLElement): AssociatedRequest[] {
        const pageHostname = window.location.hostname;
        const iframe = element.closest("iframe");

        const elementHtml = [element, ...Array.from(element.querySelectorAll("*"))]
            .map((node) => node.outerHTML)
            .join(" ")
            .toLowerCase();

        return findInspectorAssociatedRequests(
            this.networkLog,
            pageHostname,
            elementHtml,
            iframe?.src,
            window.location.href,
        );
    }

    private async blockDomain(button: HTMLButtonElement): Promise<void> {
        if (!this.options.onBlockDomain || button.disabled) {
            return;
        }

        const domain = button.dataset.domain;
        if (!domain) {
            return;
        }

        button.disabled = true;
        try {
            const result = await this.options.onBlockDomain(domain);
            if (result?.success) {
                button.textContent = "Blocked!";
                this.options.showToast({ message: `${domain} added to blocklist.`, type: "success" });
                return;
            }

            button.disabled = false;
            this.options.showToast({ message: result?.message || `Could not block ${domain}.`, type: "error" });
        } catch {
            button.disabled = false;
            this.options.showToast({ message: "Error communicating with extension.", type: "error" });
        }
    }
}
