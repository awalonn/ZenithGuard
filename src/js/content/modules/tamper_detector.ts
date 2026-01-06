// src/js/content/modules/tamper_detector.ts

/**
 * Service to protect ZenithGuard's DOM elements (Styles, UI, Shadow Roots) from
 * being removed or tampered with by hostile scripts.
 */
class TamperDetector {
    private static instance: TamperDetector;
    private protectedIds: Map<string, () => void> = new Map();
    private observers: MutationObserver[] = [];
    private isSuspended = false;

    private constructor() {
        this.startObserving();
    }

    public static getInstance(): TamperDetector {
        if (!TamperDetector.instance) {
            TamperDetector.instance = new TamperDetector();
        }
        return TamperDetector.instance;
    }

    /**
     * Registers an element ID to be protected.
     * @param id The DOM ID to watch.
     * @param onRestoration Callback to execute if the element is removed.
     */
    public protect(id: string, onRestoration: () => void) {
        this.protectedIds.set(id, onRestoration);
    }

    /**
     * Stops protecting an element ID.
     */
    public unprotect(id: string) {
        this.protectedIds.delete(id);
    }

    private startObserving() {
        const handleMutations = (mutations: MutationRecord[]) => {
            if (this.isSuspended) return;

            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const el = node as HTMLElement;
                            if (el.id && this.protectedIds.has(el.id)) {
                                console.warn(`ZenithGuard: Protected element #${el.id} was removed! Restoring...`);
                                this.triggerRestoration(el.id);
                            }
                        }
                    });
                } else if (mutation.type === 'attributes') {
                    // Check if style was modified to hide it (e.g. display: none)
                    const el = mutation.target as HTMLElement;
                    if (el.id && this.protectedIds.has(el.id)) {
                        if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') {
                            console.warn(`ZenithGuard: Protected element #${el.id} was hidden! Restoring...`);
                            this.triggerRestoration(el.id);
                        }
                    }
                }
            }
        };

        const observerConfig = { childList: true, attributes: true, attributeFilter: ['style', 'class'] };

        // Observe Head (for styles)
        const headObserver = new MutationObserver(handleMutations);
        if (document.head) headObserver.observe(document.head, observerConfig);
        this.observers.push(headObserver);

        // Observe Body (for UI)
        // Wait for body if not ready (though content scripts usually run at document_start/end, safer to wait)
        const observeBody = () => {
            if (document.body) {
                const bodyObserver = new MutationObserver(handleMutations);
                bodyObserver.observe(document.body, observerConfig);
                this.observers.push(bodyObserver);
            } else {
                setTimeout(observeBody, 100);
            }
        };
        observeBody();
    }

    private triggerRestoration(id: string) {
        const callback = this.protectedIds.get(id);
        if (callback) {
            // Suspend briefly to avoid loops if restoration triggers observer
            this.isSuspended = true;
            try {
                callback();
            } catch (e) {
                console.error("ZenithGuard: Restoration failed for", id, e);
            }
            setTimeout(() => this.isSuspended = false, 0);
        }
    }
}

// Export singleton
export const tamperDetector = TamperDetector.getInstance();
