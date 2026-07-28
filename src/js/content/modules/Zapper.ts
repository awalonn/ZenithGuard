import { getSync, setSync } from "../../shared/storage_api";
import { findMatchingRuleBucketKey } from "./CosmeticFilter";
import { normalizeCustomHidingRuleBuckets } from "../../shared/site_bucket_maps";
import { generateUniqueSelector } from "./selector";
import type { ToastOptions } from "./toast";
import { UiProtection } from "./UiProtection";

const ZAPPER_HIGHLIGHT_ID = "zg-zapper-highlight";
const ZAPPER_BANNER_ID = "zg-zapper-banner";
const ZAPPER_UI_SELECTOR = `#${ZAPPER_HIGHLIGHT_ID}, #${ZAPPER_BANNER_ID}, #zg-zapper-undo-btn, #zg-zapper-exit-btn`;

export type ZapperOptions = {
    onSaveRule: (selector: string) => void | Promise<void>;
    onReapply: () => void;
    showToast: (options: ToastOptions) => void;
};

export class Zapper {
    private active = false;
    private overlay: HTMLDivElement | null = null;
    private banner: HTMLDivElement | null = null;
    private undoStack: Array<{ element: HTMLElement; selector: string }> = [];
    private readonly uiProtection = UiProtection.getInstance();

    constructor(private readonly options: ZapperOptions) {}

    toggle(): void {
        if (this.active) {
            this.stop();
            return;
        }

        this.start();
    }

    start(): void {
        if (this.active) {
            return;
        }

        this.active = true;
        this.undoStack.length = 0;
        this.mount();
        document.addEventListener("mouseover", this.handleMouseOver, true);
        document.addEventListener("click", this.handleClick, true);
        document.addEventListener("keydown", this.handleKeyDown, true);
    }

    stop(): void {
        if (!this.active) {
            this.cleanupMountedUi();
            return;
        }

        this.active = false;
        document.removeEventListener("mouseover", this.handleMouseOver, true);
        document.removeEventListener("click", this.handleClick, true);
        document.removeEventListener("keydown", this.handleKeyDown, true);
        this.cleanupMountedUi();
    }

    private cleanupMountedUi(): void {
        this.uiProtection.unprotect(ZAPPER_HIGHLIGHT_ID);
        this.uiProtection.unprotect(ZAPPER_BANNER_ID);
        document.querySelectorAll(`#${ZAPPER_HIGHLIGHT_ID}, #${ZAPPER_BANNER_ID}`).forEach((element) => element.remove());
        this.overlay = null;
        this.banner = null;
    }

    private mount(): void {
        this.cleanupMountedUi();

        this.overlay = document.createElement("div");
        this.overlay.id = ZAPPER_HIGHLIGHT_ID;

        this.banner = document.createElement("div");
        this.banner.id = ZAPPER_BANNER_ID;
        this.banner.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647;
            background-color: #1f2937; color: #f9fafb; padding: 10px;
            font-family: sans-serif; font-size: 14px; text-align: center;
            display: flex; justify-content: center; align-items: center; gap: 15px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        `;

        const title = document.createElement("span");
        title.innerHTML = "<strong>Zapper Active</strong>";
        title.style.color = "#00E5FF";

        const undoButton = document.createElement("button");
        undoButton.id = "zg-zapper-undo-btn";
        undoButton.textContent = "Undo Last";
        undoButton.disabled = true;
        undoButton.style.cssText = `
            background-color: #4b5563; color: white; border: 1px solid #6b7280;
            padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;
            opacity: 0.5; pointer-events: auto;
        `;
        undoButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.undo();
        };

        const exitButton = document.createElement("button");
        exitButton.id = "zg-zapper-exit-btn";
        exitButton.textContent = "Exit";
        exitButton.style.cssText = `
            background-color: #ef4444; color: white; border: none;
            padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;
            pointer-events: auto;
        `;
        exitButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.stop();
        };

        this.banner.appendChild(title);
        this.banner.appendChild(undoButton);
        this.banner.appendChild(exitButton);

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.banner);
        this.uiProtection.protect(ZAPPER_HIGHLIGHT_ID, () => {
            if (this.active && this.overlay && !document.getElementById(ZAPPER_HIGHLIGHT_ID)) {
                document.body.appendChild(this.overlay);
            }
        });
        this.uiProtection.protect(ZAPPER_BANNER_ID, () => {
            if (this.active && this.banner && !document.getElementById(ZAPPER_BANNER_ID)) {
                document.body.appendChild(this.banner);
            }
        });
    }

    private isZapperUiTarget(target: HTMLElement | null): boolean {
        return Boolean(target && (target.matches(ZAPPER_UI_SELECTOR) || target.closest(ZAPPER_UI_SELECTOR)));
    }

    private handleMouseOver = (event: MouseEvent): void => {
        if (!this.active || !this.overlay) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || this.isZapperUiTarget(target)) {
            this.overlay.style.display = "none";
            return;
        }

        const rect = target.getBoundingClientRect();
        Object.assign(this.overlay.style, {
            display: "block",
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`,
        });
    };

    private handleClick = async (event: MouseEvent): Promise<void> => {
        if (!this.active) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target || this.isZapperUiTarget(target)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const selector = generateUniqueSelector(target);
        if (!selector) {
            this.options.showToast({ message: "Could not generate a unique selector.", type: "error" });
            return;
        }

        target.style.display = "none";
        target.classList.add("zg-zapped-temp");
        await this.options.onSaveRule(selector);
        this.undoStack.push({ element: target, selector });
        this.updateUndoButton();
    };

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.active) {
            return;
        }

        if (event.key === "Escape") {
            this.stop();
            return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            void this.undo();
        }
    };

    private async undo(): Promise<void> {
        const last = this.undoStack.pop();
        if (!last) {
            return;
        }

        last.element.style.setProperty("display", "revert", "important");
        last.element.classList.remove("zg-zapped-temp");

        const hostname = window.location.hostname;
        const snapshot = await getSync<{ customHidingRules?: Record<string, Array<{ value: string; enabled: boolean }>> }>(["customHidingRules"]);
        const customHidingRules = snapshot.customHidingRules || {};
        const bucketKey = findMatchingRuleBucketKey(hostname, customHidingRules);
        if (bucketKey && Array.isArray(customHidingRules[bucketKey])) {
            const previousLength = customHidingRules[bucketKey].length;
            customHidingRules[bucketKey] = customHidingRules[bucketKey].filter((rule) => rule.value !== last.selector);
            if (customHidingRules[bucketKey].length !== previousLength) {
                if (customHidingRules[bucketKey].length === 0) {
                    delete customHidingRules[bucketKey];
                }
                await setSync({ customHidingRules: normalizeCustomHidingRuleBuckets(customHidingRules) });
                this.options.onReapply();
            }
        }

        this.updateUndoButton();
    }

    private updateUndoButton(): void {
        const undoButton = this.banner?.querySelector("#zg-zapper-undo-btn") as HTMLButtonElement | null;
        if (!undoButton) {
            return;
        }

        if (this.undoStack.length > 0) {
            undoButton.disabled = false;
            undoButton.textContent = `Undo (${this.undoStack.length})`;
            undoButton.style.opacity = "1";
        } else {
            undoButton.disabled = true;
            undoButton.textContent = "Undo";
            undoButton.style.opacity = "0.5";
        }
    }
}
