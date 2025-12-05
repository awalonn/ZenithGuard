// src/js/content/ai_hider.ts

interface AIHiderUI {
    overlay: HTMLElement;
    container: HTMLElement;
    title: HTMLElement;
    inputView: HTMLElement;
    previewView: HTMLElement;
    errorView: HTMLElement;
    errorMessage: HTMLElement;
    tryAgainBtn: HTMLElement;
    textarea: HTMLTextAreaElement;
    submitBtn: HTMLButtonElement;
    cancelBtn: HTMLElement;
    selectorDisplay: HTMLInputElement;
    previewActions: HTMLElement;
    discardBtn: HTMLElement;
    previewBtn: HTMLElement;
    applyBtn: HTMLElement;
}

interface AIHiderContext {
    tag: string;
    id?: string;
    classes?: string;
    text?: string;
}

window.ZenithGuardAIHider = (() => {
    let activeCallback: ((selector: string) => void) | null = null;
    let uiElements: AIHiderUI | null = null;
    let generatedSelector: string | null = null;

    function createUI() {
        if (document.getElementById('zenithguard-ai-hider-overlay')) return;

        // Hardening measure: Ensure theme CSS is loaded. Solves the "transparent modal" bug.
        if (!document.getElementById('zenithguard-theme-styles-runtime')) {
            const themeLink = document.createElement('link');
            themeLink.id = 'zenithguard-theme-styles-runtime';
            themeLink.rel = 'stylesheet';
            themeLink.type = 'text/css';
            themeLink.href = chrome.runtime.getURL('css/theme.css');
            document.head.appendChild(themeLink);
        }

        const overlay = document.createElement('div');
        overlay.id = 'zenithguard-ai-hider-overlay';

        const container = document.createElement('div');
        container.id = 'zenithguard-ai-hider-container';

        container.innerHTML = `
            <h3 id="zenithguard-ai-hider-title">Describe Element to Hide</h3>
            
            <!-- Initial Input State -->
            <div id="zenithguard-ai-hider-input-view">
                <textarea id="zenithguard-ai-hider-textarea" placeholder="e.g., 'the floating video player in the bottom corner' or 'the newsletter sign-up pop-up'"></textarea>
                <div id="zenithguard-ai-hider-actions">
                    <button id="zenithguard-ai-hider-cancel" class="zenithguard-ai-hider-btn">Cancel</button>
                    <button id="zenithguard-ai-hider-submit" class="zenithguard-ai-hider-btn">Generate Selector</button>
                </div>
            </div>

            <!-- Preview State -->
            <div id="zenithguard-ai-hider-preview-view" class="hidden">
                <input type="text" id="zenithguard-ai-hider-selector-display" readonly>
                <div id="zenithguard-ai-hider-preview-actions">
                    <button id="zenithguard-ai-hider-discard" class="zenithguard-ai-hider-btn">Discard</button>
                    <div>
                        <button id="zenithguard-ai-hider-preview-btn" class="zenithguard-ai-hider-btn zenithguard-ai-hider-preview-btn">Preview</button>
                        <button id="zenithguard-ai-hider-apply-btn" class="zenithguard-ai-hider-btn">Apply & Save</button>
                    </div>
                </div>
            </div>
            
            <!-- Error State -->
            <div id="zenithguard-ai-hider-error-view" class="hidden">
                <p id="zenithguard-ai-hider-error-message"></p>
                <button id="zenithguard-ai-hider-try-again" class="zenithguard-ai-hider-btn">Try Again</button>
            </div>
        `;

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        uiElements = {
            overlay, container,
            title: document.getElementById('zenithguard-ai-hider-title') as HTMLElement,
            inputView: document.getElementById('zenithguard-ai-hider-input-view') as HTMLElement,
            previewView: document.getElementById('zenithguard-ai-hider-preview-view') as HTMLElement,
            errorView: document.getElementById('zenithguard-ai-hider-error-view') as HTMLElement,
            errorMessage: document.getElementById('zenithguard-ai-hider-error-message') as HTMLElement,
            tryAgainBtn: document.getElementById('zenithguard-ai-hider-try-again') as HTMLElement,
            textarea: document.getElementById('zenithguard-ai-hider-textarea') as HTMLTextAreaElement,
            submitBtn: document.getElementById('zenithguard-ai-hider-submit') as HTMLButtonElement,
            cancelBtn: document.getElementById('zenithguard-ai-hider-cancel') as HTMLElement,
            selectorDisplay: document.getElementById('zenithguard-ai-hider-selector-display') as HTMLInputElement,
            previewActions: document.getElementById('zenithguard-ai-hider-preview-actions') as HTMLElement,
            discardBtn: document.getElementById('zenithguard-ai-hider-discard') as HTMLElement,
            previewBtn: document.getElementById('zenithguard-ai-hider-preview-btn') as HTMLElement,
            applyBtn: document.getElementById('zenithguard-ai-hider-apply-btn') as HTMLElement,
        };

        uiElements.textarea.focus();
    }

    function destroyUI() {
        if (!uiElements) return;

        if (uiElements.overlay) {
            uiElements.overlay.remove();
        }
        chrome.runtime.sendMessage({ type: 'CLEAR_PREVIEW' }).catch(() => { });
        uiElements = null;
        activeCallback = null;
        generatedSelector = null;
    }

    function setViewState(state: 'input' | 'preview' | 'error') {
        if (!uiElements) return;
        uiElements.inputView.classList.add('hidden');
        uiElements.previewView.classList.add('hidden');
        uiElements.errorView.classList.add('hidden');

        if (state === 'input') {
            uiElements.title.textContent = 'Describe Element to Hide';
            uiElements.inputView.classList.remove('hidden');
            uiElements.textarea.focus();
        } else if (state === 'preview') {
            uiElements.title.textContent = 'Generated Selector';
            uiElements.previewView.classList.remove('hidden');
        } else if (state === 'error') {
            uiElements.title.textContent = 'An Error Occurred';
            uiElements.errorView.classList.remove('hidden');
        }
    }

    function setLoading(isLoading: boolean) {
        if (!uiElements) return;
        if (isLoading) {
            uiElements.submitBtn.disabled = true;
            uiElements.submitBtn.innerHTML = `<div class="zenithguard-ai-hider-spinner"></div><span>Generating...</span>`;
            uiElements.submitBtn.style.display = 'flex';
            uiElements.submitBtn.style.alignItems = 'center';
        } else {
            uiElements.submitBtn.disabled = false;
            uiElements.submitBtn.innerHTML = 'Generate Selector';
        }
    }

    function showPreviewState(selector: string) {
        if (!uiElements) return;
        generatedSelector = selector;
        setViewState('preview');
        uiElements.selectorDisplay.value = selector;

        uiElements.previewActions.style.display = 'flex';
        uiElements.previewActions.style.justifyContent = 'space-between';

        const innerDiv = uiElements.previewActions.querySelector('div');
        if (innerDiv) {
            innerDiv.style.display = 'flex';
            innerDiv.style.gap = '10px';
        }
    }

    function showError(message: string) {
        if (!uiElements) return;
        setViewState('error');
        if (message === 'QUOTA_EXCEEDED') {
            uiElements.errorMessage.textContent = "The AI is currently busy due to high demand. Please try again in a few moments.";
        } else {
            uiElements.errorMessage.textContent = message;
        }
    }

    async function handleSubmit(context: AIHiderContext | null) {
        if (!uiElements) return;
        const description = uiElements.textarea.value.trim();
        if (description.length < 5) {
            showError("Please provide a more detailed description.");
            return;
        }

        setLoading(true);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'HIDE_ELEMENT_WITH_AI',
                data: { description, context }
            });

            if (response.error) {
                throw new Error(response.error);
            }

            if (response.selector) {
                showPreviewState(response.selector);
            } else {
                throw new Error("AI did not return a valid selector.");
            }
        } catch (error: any) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    }

    function handlePreviewToggle() {
        if (!uiElements) return;
        const isActive = uiElements.previewBtn.classList.toggle('active');
        const message = {
            type: isActive ? 'PREVIEW_ELEMENT' : 'CLEAR_PREVIEW',
            selector: generatedSelector
        };
        chrome.runtime.sendMessage(message).catch(() => { });
    }

    function handleApply() {
        if (generatedSelector && activeCallback) {
            activeCallback(generatedSelector);
        }
        destroyUI();
    }


    function start(callback: (selector: string) => void, context: AIHiderContext | null = null) {
        if (uiElements) return;

        activeCallback = callback;
        createUI();
        uiElements = uiElements as unknown as AIHiderUI;

        // Assert uiElements is not null here since createUI just set it
        if (!uiElements) return;
        const ui = uiElements;

        if (context && context.tag) {
            let description = `the ${context.tag} element`;
            if (context.id) description += ` with ID #${context.id}`;
            if (context.classes && typeof context.classes === 'string' && context.classes.trim()) {
                const cleanClasses = context.classes.trim().replace(/\s+/g, ' ');
                description += ` with classes "${cleanClasses}"`;
            }
            if (context.text) description += ` containing text like "${context.text.substring(0, 80)}..."`;

            uiElements.textarea.value = description;
        }

        // Attach initial listeners
        uiElements.submitBtn.addEventListener('click', () => handleSubmit(context));
        uiElements.cancelBtn.addEventListener('click', destroyUI);

        // Attach listeners for preview state
        uiElements.previewBtn.addEventListener('click', handlePreviewToggle);
        uiElements.applyBtn.addEventListener('click', handleApply);
        uiElements.discardBtn.addEventListener('click', destroyUI);

        // Attach listeners for error state
        uiElements.tryAgainBtn.addEventListener('click', () => setViewState('input'));

        // General listeners
        uiElements.overlay.addEventListener('click', (e) => {
            if (uiElements && e.target === uiElements.overlay) destroyUI();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') destroyUI();
        }, { once: true });
    }

    return { start };
})();
