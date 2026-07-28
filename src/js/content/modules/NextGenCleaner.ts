const CLEANUP_MARKERS = ["adskeeper", "mgid"] as const;
const CLEANUP_CANDIDATE_SELECTOR = [
    '[id*="adskeeper" i]',
    '[class*="adskeeper" i]',
    '[id*="mgid" i]',
    '[class*="mgid" i]',
].join(", ");

export class NextGenCleaner {
    private enabled = false;
    private observer: MutationObserver | null = null;

    start(): void {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["id", "class"],
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
    }

    private handleMutations(mutations: MutationRecord[]): void {
        if (!this.enabled) {
            return;
        }

        for (const mutation of mutations) {
            if (mutation.type === "attributes" && mutation.target instanceof Element) {
                this.processElement(mutation.target);
                continue;
            }

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
