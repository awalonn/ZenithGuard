type RestoreCallback = () => void;

export class UiProtection {
    private static instance: UiProtection | null = null;
    private protectedIds = new Map<string, RestoreCallback>();
    private observers: MutationObserver[] = [];
    private suspended = false;

    static getInstance(): UiProtection {
        if (!UiProtection.instance) {
            UiProtection.instance = new UiProtection();
        }

        return UiProtection.instance;
    }

    private constructor() {
        this.startObserving();
    }

    protect(id: string, callback: RestoreCallback): void {
        this.protectedIds.set(id, callback);
    }

    unprotect(id: string): void {
        this.protectedIds.delete(id);
    }

    private startObserving(): void {
        const onMutations = (mutations: MutationRecord[]): void => {
            if (this.suspended) {
                return;
            }

            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType !== Node.ELEMENT_NODE) {
                            return;
                        }

                        const element = node as HTMLElement;
                        if (element.id && this.protectedIds.has(element.id)) {
                            this.restore(element.id);
                        }
                    });
                    continue;
                }

                if (mutation.type === "attributes") {
                    const element = mutation.target as HTMLElement;
                    if (!element.id || !this.protectedIds.has(element.id)) {
                        continue;
                    }

                    if (element.style.display === "none" || element.style.visibility === "hidden" || element.style.opacity === "0") {
                        this.restore(element.id);
                    }
                }
            }
        };

        const options: MutationObserverInit = {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class"],
        };

        const headObserver = new MutationObserver(onMutations);
        if (document.head) {
            headObserver.observe(document.head, options);
            this.observers.push(headObserver);
        }

        const attachBodyObserver = (): void => {
            if (!document.body) {
                window.setTimeout(attachBodyObserver, 100);
                return;
            }

            const bodyObserver = new MutationObserver(onMutations);
            bodyObserver.observe(document.body, options);
            this.observers.push(bodyObserver);
        };

        attachBodyObserver();
    }

    private restore(id: string): void {
        const callback = this.protectedIds.get(id);
        if (!callback) {
            return;
        }

        this.suspended = true;
        try {
            callback();
        } catch {
            // Ignore restoration failures while reapplying protected UI state.
        }

        window.setTimeout(() => {
            this.suspended = false;
        }, 0);
    }
}
