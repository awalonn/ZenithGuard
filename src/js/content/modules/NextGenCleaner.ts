const CLEANUP_MARKERS = ["adskeeper", "mgid"] as const;
const CLEANUP_CANDIDATE_SELECTOR = [
    '[id*="adskeeper" i]',
    '[class*="adskeeper" i]',
    '[id*="mgid" i]',
    '[class*="mgid" i]',
].join(", ");
const CLEANUP_STYLE_ID = "zenithguard-next-gen-cleaner-styles";
const CLEANUP_STYLE = CLEANUP_CANDIDATE_SELECTOR
    .split(", ")
    .map((selector) => `${selector}:not([id^="zg-"]):not([class*="zg-"])`)
    .join(", ");

export class NextGenCleaner {
    private enabled = false;
    private observer: MutationObserver | null = null;

    start(): void {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        this.ensureCleanupStyle();
        this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        document.querySelectorAll(CLEANUP_CANDIDATE_SELECTOR).forEach((element) => this.processElement(element));
    }

    stop(): void {
        if (!this.enabled) {
            return;
        }

        this.enabled = false;
        this.observer?.disconnect();
        this.observer = null;
        document.getElementById(CLEANUP_STYLE_ID)?.remove();
    }

    private handleMutations(mutations: MutationRecord[]): void {
        if (!this.enabled) {
            return;
        }

        for (const mutation of mutations) {
            if (mutation.type !== "childList") {
                continue;
            }

            mutation.addedNodes.forEach((node) => {
                if (node instanceof Element) {
                    this.processElementTree(node);
                }
            });
        }
    }

    private ensureCleanupStyle(): void {
        if (document.getElementById(CLEANUP_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = CLEANUP_STYLE_ID;
        style.textContent = `${CLEANUP_STYLE} { display: none !important; }`;
        (document.head || document.documentElement).appendChild(style);
    }

    private processElementTree(element: Element): void {
        this.processElement(element);
        element.querySelectorAll(CLEANUP_CANDIDATE_SELECTOR).forEach((candidate) => this.processElement(candidate));
    }

    private processElement(element: Element): void {
        const id = element.getAttribute("id") || "";
        const className = element.getAttribute("class") || "";
        if (id.startsWith("zg-") || Array.from(element.classList).some((token) => token.startsWith("zg-"))) {
            return;
        }

        const fingerprint = `${id} ${className}`.toLowerCase();
        if (CLEANUP_MARKERS.some((marker) => fingerprint.includes(marker))
            && (element instanceof HTMLElement || element instanceof SVGElement)) {
            element.style.setProperty("display", "none", "important");
        }
    }
}
