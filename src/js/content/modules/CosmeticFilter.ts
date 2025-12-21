
import { HidingRule } from '../../types.js'; // Adjust path if needed

export class CosmeticFilter {

    constructor() { }

    private aggressiveRules: Set<string> = new Set();
    private observerTimeout: any = null;

    public applyHidingRules(rules: HidingRule[], source: string) {
        if (!rules) return;

        // Standard CSS Injection (Fast, efficient)
        const styleId = `zenithguard-styles-${source}`;
        let styleSheet = document.getElementById(styleId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        }

        // Filter YouTube Skip Buttons
        const SAFE_SELECTORS = [
            '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', '.videoAdUiSkipButton',
            '.ytp-ad-skip-button-container', '.ytp-ad-module'
        ];

        const validRules = rules.filter(r => r.enabled && r.value);
        const cssRules = validRules
            .map(r => r.value)
            .filter(selector => !SAFE_SELECTORS.some(safe => selector.includes(safe)));

        if (cssRules.length > 0) {
            const selector = cssRules.join(', ');
            styleSheet.textContent = `${selector}:not(#zg-zapper-highlight):not(#zg-inspector-highlight) { display: none !important; }`;
        } else {
            styleSheet.textContent = '';
        }

        // AGGRESSIVE MODE: For Custom Rules (Zapper/Manual) and AI Rules
        // We apply the "Nuclear" option: Physical Removal + Mutation Observation
        if (source === 'custom') {
            cssRules.forEach(s => this.aggressiveRules.add(s));
            this.startAggressiveObserver();
            this.enforceAggressiveFiltering();
        }
    }

    public executeAdblockWallFix(selectors: { overlaySelector: string, scrollSelector?: string }) {
        this.applyWallFix(selectors);
        this.showToast({ message: 'AI Anti-Adblock Wall activated.', type: 'success', duration: 6000 });
    }

    public applyWallFix(selectors: { overlaySelector: string; scrollSelector?: string }) {
        const { overlaySelector, scrollSelector } = selectors;
        if (!overlaySelector) return;

        // Add to aggressive set
        overlaySelector.split(',').forEach(s => this.aggressiveRules.add(s.trim()));

        // Handle scroll unlocking specifically
        if (scrollSelector) {
            this.unlockScroll(scrollSelector);
        } else {
            this.unlockScroll('body');
            this.unlockScroll('html');
        }

        this.startAggressiveObserver();
        this.enforceAggressiveFiltering();
    }

    private startAggressiveObserver() {
        if (!this.wallFixObserver) {
            this.wallFixObserver = new MutationObserver(() => {
                // Debounce the heavy DOM search
                if (this.observerTimeout) clearTimeout(this.observerTimeout);
                this.observerTimeout = setTimeout(() => {
                    this.enforceAggressiveFiltering();
                }, 100); // Check every 100ms max
            });
            this.wallFixObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'id']
            });
        }
    }

    private enforceAggressiveFiltering() {
        if (this.aggressiveRules.size === 0) return;

        // 1. Force CSS injection at bottom
        this.ensureAggressiveStyleTag();

        // 2. Physical Removal
        this.aggressiveRules.forEach(selector => {
            const elements = this.findEverywhere(selector);
            elements.forEach(el => {
                const htmlEl = el as HTMLElement;
                // Only touch if it's visible or exists
                const style = window.getComputedStyle(htmlEl);
                if (style.display !== 'none' || style.visibility !== 'hidden') {
                    try {
                        htmlEl.remove();
                        console.log(`ZenithGuard: Physically removed "${selector}"`);
                    } catch (e) {
                        htmlEl.style.setProperty('display', 'none', 'important');
                    }
                }
            });
        });

        // 3. Re-Check Scroll Locks (Generic)
        this.unlockScroll('body');
        this.unlockScroll('html');
    }

    private ensureAggressiveStyleTag() {
        const styleId = 'zenithguard-aggressive-styles';
        let styleSheet = document.getElementById(styleId) as HTMLStyleElement;
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        } else {
            // Keep moving to bottom
            if (document.head && document.head.lastElementChild !== styleSheet) {
                document.head.appendChild(styleSheet);
            }
        }

        const fullCss = Array.from(this.aggressiveRules).map(s => `${s} { 
            display: none !important; 
            opacity: 0 !important; 
            pointer-events: none !important; 
            visibility: hidden !important; 
            z-index: -2147483647 !important;
            width: 0 !important; height: 0 !important;
            position: fixed !important; top: -10000px !important;
        }`).join('\n');

        if (styleSheet.textContent !== fullCss) styleSheet.textContent = fullCss;
    }

    private unlockScroll(selector: string) {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
            const style = window.getComputedStyle(el);
            if (style.overflow === 'hidden' || style.position === 'fixed' || style.height === '100%') {
                el.style.setProperty('overflow', 'visible', 'important');
                el.style.setProperty('position', 'static', 'important');
                el.style.setProperty('height', 'auto', 'important');
                el.style.setProperty('pointer-events', 'auto', 'important');
            }
        }
    }

    // ... (Keep existing previewElement, previewManualRule, applyIframeSandboxing, saveHidingRule) ...
    // Note: I will need to be careful not to delete those methods in the replacement if I don't include them.
    // Since I am replacing the CLASS BODY effectively or a large chunk, I must be precise.
    // The instructions say "EndLine: 228", which is the end of the file.
    // I need to make sure I include the other methods or use multiple chunks.
    // Ah, applyHidingRules starts at line 8.
    // I will replace from line 8 to line 228 with the new implementation including helper methods.

    // WAIT: I shouldn't delete `applyIframeSandboxing` etc.
    // I'll use target start/end lines to surgical replace.
    // I will replace `applyHidingRules` through `applyWallFixStyles` with the new unified logic.
    // And keep `previewElement` etc. if possible.
    // But `previewElement` is in the middle.
    // Usage: `applyHidingRules` (8-44)
    // `previewElement` (46-59)
    // `previewManualRule` (61-82)
    // `applyIframeSandboxing` (84-98)
    // `saveHidingRule` (100-116)
    // `wallFixObserver`... (117)

    // I will replace `applyHidingRules` separately, then replace the bottom half.

    public previewElement(selector: string | null, isPreviewing: boolean) {
        const styleId = 'zenithguard-preview-style';
        let styleSheet = document.getElementById(styleId);
        if (isPreviewing && selector) {
            if (!styleSheet) {
                styleSheet = document.createElement('style');
                styleSheet.id = styleId;
                (document.head || document.documentElement).appendChild(styleSheet);
            }
            styleSheet.textContent = `${selector} { outline: 3px dashed #d97706 !important; background-color: rgba(251, 191, 36, 0.3) !important; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5); }`;
        } else if (styleSheet) {
            styleSheet.remove();
        }
    }

    public previewManualRule(selector: string) {
        const styleId = 'zenithguard-manual-preview-style';
        let styleSheet = document.getElementById(styleId);
        if (styleSheet) styleSheet.remove();

        styleSheet = document.createElement('style');
        styleSheet.id = styleId;
        styleSheet.textContent = `
            ${selector} { 
                outline: 3px solid #22c55e !important; 
                box-shadow: 0 0 15px #22c55e, 0 0 0 9999px rgba(34, 197, 94, 0.2) !important;
                transition: outline 0.3s, box-shadow 0.3s;
                border-radius: 4px;
            }
        `;
        (document.head || document.documentElement).appendChild(styleSheet);

        setTimeout(() => {
            const sheet = document.getElementById(styleId);
            if (sheet) sheet.remove();
        }, 2500);
    }

    public applyIframeSandboxing() {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const ownDomain = window.location.hostname;
        const sandboxPermissions = "allow-scripts allow-same-origin allow-presentation allow-popups allow-forms";

        for (const iframe of iframes) {
            try {
                if (iframe.src && new URL(iframe.src).hostname !== ownDomain) {
                    if (!iframe.hasAttribute('sandbox')) {
                        iframe.setAttribute('sandbox', sandboxPermissions);
                    }
                }
            } catch (e) { }
        }
    }

    public async saveHidingRule(selector: string) {
        try {
            const domain = window.location.hostname;
            let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as any;
            if (!customHidingRules[domain]) customHidingRules[domain] = [];

            if (!customHidingRules[domain].some((r: any) => r.value === selector)) {
                customHidingRules[domain].push({ value: selector, enabled: true });
                await chrome.storage.sync.set({ customHidingRules });
                this.showToast({ message: 'Hiding rule saved!' });
            } else {
                this.showToast({ message: 'This hiding rule already exists.' });
            }
        } catch (e: any) {
            this.showToast({ message: 'Failed to save rule.', type: 'error' });
        }
    }
    private wallFixObserver: MutationObserver | null = null;
    private activeWallFix: { overlaySelector: string, scrollSelector?: string } | null = null;


    /**
     * Finds elements everywhere, including inside open Shadow Roots.
     */
    private findEverywhere(selector: string, root: Document | Element | ShadowRoot = document): Element[] {
        if (!selector || typeof selector !== 'string' || selector.trim() === '' || selector === '0') return [];

        let results: Element[] = [];
        try {
            results = Array.from(root.querySelectorAll(selector));
        } catch (e) {
            // console.warn(`ZenithGuard: Invalid selector skipped: "${selector}"`, e);
            return [];
        }

        // Find all shadow hosts in this root
        const hosts = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
        for (const host of hosts) {
            if (host.shadowRoot) {
                results = results.concat(this.findEverywhere(selector, host.shadowRoot));
            }
        }

        return results;
    }

    private showToast(options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) {
        if ((window as any).ZenithGuardToastUtils && (window as any).ZenithGuardToastUtils.showToast) {
            (window as any).ZenithGuardToastUtils.showToast(options);
        }
    }
}
