import { hideElementWithAi } from "../../shared/runtime_messages";
import { UiProtection } from "./UiProtection";

export type AiHiderTargetContext = {
    tag?: string;
    id?: string;
    classes?: string;
    text?: string;
};

export type AiHiderStartOptions = {
    onApply: (selector: string) => void | Promise<void>;
    onPreview: (selector: string | null) => void;
    context?: AiHiderTargetContext | null;
};

type AiHiderElements = {
    overlay: HTMLDivElement;
    container: HTMLDivElement;
    title: HTMLHeadingElement;
    inputView: HTMLDivElement;
    previewView: HTMLDivElement;
    errorView: HTMLDivElement;
    errorMessage: HTMLParagraphElement;
    tryAgainBtn: HTMLButtonElement;
    textarea: HTMLTextAreaElement;
    submitBtn: HTMLButtonElement;
    cancelBtn: HTMLButtonElement;
    selectorDisplay: HTMLInputElement;
    previewActions: HTMLDivElement;
    discardBtn: HTMLButtonElement;
    previewBtn: HTMLButtonElement;
    applyBtn: HTMLButtonElement;
};

export class AiHider {
    private elements: AiHiderElements | null = null;
    private generatedSelector: string | null = null;
    private onApply: ((selector: string) => void | Promise<void>) | null = null;
    private onPreview: ((selector: string | null) => void) | null = null;
    private readonly uiProtection = UiProtection.getInstance();

    start(options: AiHiderStartOptions): void {
        if (this.elements) {
            return;
        }

        this.onApply = options.onApply;
        this.onPreview = options.onPreview;
        this.mount();
        if (!this.elements) {
            return;
        }

        if (options.context?.tag) {
            let prompt = `the ${options.context.tag} element`;
            if (options.context.id) {
                prompt += ` with ID #${options.context.id}`;
            }
            if (options.context.classes && options.context.classes.trim()) {
                prompt += ` with classes "${options.context.classes.trim().replace(/\s+/g, " ")}"`;
            }
            if (options.context.text) {
                prompt += ` containing text like "${options.context.text.substring(0, 80)}..."`;
            }
            this.elements.textarea.value = prompt;
        }

        this.elements.submitBtn.addEventListener("click", () => void this.generate(options.context || null));
        this.elements.cancelBtn.addEventListener("click", () => this.close());
        this.elements.discardBtn.addEventListener("click", () => this.close());
        this.elements.tryAgainBtn.addEventListener("click", () => this.showView("input"));
        this.elements.previewBtn.addEventListener("click", () => this.togglePreview());
        this.elements.applyBtn.addEventListener("click", () => void this.apply());
        this.elements.overlay.addEventListener("click", (event) => {
            if (event.target === this.elements?.overlay) {
                this.close();
            }
        });

        document.addEventListener("keydown", this.handleEscape, { once: true });
    }

    private mount(): void {
        if (document.getElementById("zenithguard-ai-hider-overlay")) {
            return;
        }

        if (!document.getElementById("zenithguard-theme-styles-runtime")) {
            const themeLink = document.createElement("link");
            themeLink.id = "zenithguard-theme-styles-runtime";
            themeLink.rel = "stylesheet";
            themeLink.type = "text/css";
            themeLink.href = chrome.runtime.getURL("css/theme.css");
            document.head.appendChild(themeLink);
        }

        const overlay = document.createElement("div");
        overlay.id = "zenithguard-ai-hider-overlay";

        const container = document.createElement("div");
        container.id = "zenithguard-ai-hider-container";
        container.innerHTML = `
            <h3 id="zenithguard-ai-hider-title">Describe Element to Hide</h3>
            <div id="zenithguard-ai-hider-input-view">
                <textarea id="zenithguard-ai-hider-textarea" placeholder="e.g., 'the floating video player in the bottom corner' or 'the newsletter sign-up pop-up'"></textarea>
                <div id="zenithguard-ai-hider-actions">
                    <button id="zenithguard-ai-hider-cancel" class="zenithguard-ai-hider-btn">Cancel</button>
                    <button id="zenithguard-ai-hider-submit" class="zenithguard-ai-hider-btn">Generate Selector</button>
                </div>
            </div>
            <div id="zenithguard-ai-hider-preview-view" class="zg-hidden">
                <input type="text" id="zenithguard-ai-hider-selector-display" readonly>
                <div id="zenithguard-ai-hider-preview-actions">
                    <button id="zenithguard-ai-hider-discard" class="zenithguard-ai-hider-btn">Discard</button>
                    <div>
                        <button id="zenithguard-ai-hider-preview-btn" class="zenithguard-ai-hider-btn zenithguard-ai-hider-preview-btn">Preview</button>
                        <button id="zenithguard-ai-hider-apply-btn" class="zenithguard-ai-hider-btn">Apply & Save</button>
                    </div>
                </div>
            </div>
            <div id="zenithguard-ai-hider-error-view" class="zg-hidden">
                <p id="zenithguard-ai-hider-error-message"></p>
                <button id="zenithguard-ai-hider-try-again" class="zenithguard-ai-hider-btn">Try Again</button>
            </div>
        `;

        overlay.appendChild(container);
        document.body.appendChild(overlay);
        this.uiProtection.protect("zenithguard-ai-hider-overlay", () => {
            if (this.elements?.overlay && !document.getElementById("zenithguard-ai-hider-overlay")) {
                document.body.appendChild(this.elements.overlay);
            }
        });
        this.uiProtection.protect("zenithguard-ai-hider-container", () => {
            if (!this.elements?.overlay || !this.elements?.container) {
                return;
            }

            if (!document.getElementById("zenithguard-ai-hider-container")) {
                this.elements.overlay.appendChild(this.elements.container);
            }
        });

        this.elements = {
            overlay,
            container,
            title: document.getElementById("zenithguard-ai-hider-title") as HTMLHeadingElement,
            inputView: document.getElementById("zenithguard-ai-hider-input-view") as HTMLDivElement,
            previewView: document.getElementById("zenithguard-ai-hider-preview-view") as HTMLDivElement,
            errorView: document.getElementById("zenithguard-ai-hider-error-view") as HTMLDivElement,
            errorMessage: document.getElementById("zenithguard-ai-hider-error-message") as HTMLParagraphElement,
            tryAgainBtn: document.getElementById("zenithguard-ai-hider-try-again") as HTMLButtonElement,
            textarea: document.getElementById("zenithguard-ai-hider-textarea") as HTMLTextAreaElement,
            submitBtn: document.getElementById("zenithguard-ai-hider-submit") as HTMLButtonElement,
            cancelBtn: document.getElementById("zenithguard-ai-hider-cancel") as HTMLButtonElement,
            selectorDisplay: document.getElementById("zenithguard-ai-hider-selector-display") as HTMLInputElement,
            previewActions: document.getElementById("zenithguard-ai-hider-preview-actions") as HTMLDivElement,
            discardBtn: document.getElementById("zenithguard-ai-hider-discard") as HTMLButtonElement,
            previewBtn: document.getElementById("zenithguard-ai-hider-preview-btn") as HTMLButtonElement,
            applyBtn: document.getElementById("zenithguard-ai-hider-apply-btn") as HTMLButtonElement,
        };

        this.elements.textarea.focus();
    }

    private handleEscape = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.close();
        }
    };

    private showView(view: "input" | "preview" | "error"): void {
        if (!this.elements) {
            return;
        }

        this.elements.inputView.classList.add("zg-hidden");
        this.elements.previewView.classList.add("zg-hidden");
        this.elements.errorView.classList.add("zg-hidden");

        if (view === "input") {
            this.elements.title.textContent = "Describe Element to Hide";
            this.elements.inputView.classList.remove("zg-hidden");
            this.elements.textarea.focus();
        } else if (view === "preview") {
            this.elements.title.textContent = "Generated Selector";
            this.elements.previewView.classList.remove("zg-hidden");
        } else {
            this.elements.title.textContent = "An Error Occurred";
            this.elements.errorView.classList.remove("zg-hidden");
        }
    }

    private setLoading(isLoading: boolean): void {
        if (!this.elements) {
            return;
        }

        this.elements.submitBtn.disabled = isLoading;
        if (isLoading) {
            this.elements.submitBtn.innerHTML = '<div class="zenithguard-ai-hider-spinner"></div><span>Generating...</span>';
            this.elements.submitBtn.style.display = "flex";
            this.elements.submitBtn.style.alignItems = "center";
        } else {
            this.elements.submitBtn.innerHTML = "Generate Selector";
        }
    }

    private showPreview(selector: string): void {
        if (!this.elements) {
            return;
        }

        this.generatedSelector = selector;
        this.showView("preview");
        this.elements.selectorDisplay.value = selector;
        this.elements.previewActions.style.display = "flex";
        this.elements.previewActions.style.justifyContent = "space-between";
        const rightGroup = this.elements.previewActions.querySelector("div") as HTMLDivElement | null;
        if (rightGroup) {
            rightGroup.style.display = "flex";
            rightGroup.style.gap = "10px";
        }
    }

    private showError(message: string): void {
        if (!this.elements) {
            return;
        }

        this.showView("error");
        this.elements.errorMessage.textContent = message === "QUOTA_EXCEEDED"
            ? "The AI is currently busy due to high demand. Please try again in a few moments."
            : message;
    }

    private async generate(context: AiHiderTargetContext | null): Promise<void> {
        if (!this.elements) {
            return;
        }

        const description = this.elements.textarea.value.trim();
        if (description.length < 5) {
            this.showError("Please provide a more detailed description.");
            return;
        }

        this.setLoading(true);
        try {
            const response = await hideElementWithAi(description, context ? { ...context } : null);
            if (response.error) {
                throw new Error(response.error);
            }
            if (!response.selector) {
                throw new Error("AI did not return a valid selector.");
            }
            this.showPreview(response.selector);
        } catch (error) {
            this.showError(error instanceof Error ? error.message : String(error));
        } finally {
            this.setLoading(false);
        }
    }

    private togglePreview(): void {
        if (!this.elements) {
            return;
        }

        const shouldPreview = this.elements.previewBtn.classList.toggle("active") && this.generatedSelector;
        this.onPreview?.(shouldPreview ? this.generatedSelector : null);
    }

    private async apply(): Promise<void> {
        if (this.generatedSelector && this.onApply) {
            await this.onApply(this.generatedSelector);
        }
        this.close();
    }

    close(): void {
        if (!this.elements) {
            return;
        }

        document.removeEventListener("keydown", this.handleEscape);
        this.onPreview?.(null);
        this.uiProtection.unprotect("zenithguard-ai-hider-overlay");
        this.uiProtection.unprotect("zenithguard-ai-hider-container");
        this.elements.overlay.remove();
        this.elements = null;
        this.generatedSelector = null;
        this.onApply = null;
        this.onPreview = null;
    }
}
