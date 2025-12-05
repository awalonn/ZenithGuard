// src/js/content/zapper.ts
import { AppSettings } from '../types.js';

interface ZapperHistoryItem {
    element: HTMLElement;
    selector: string;
}

window.ZenithGuardZapper = (() => {
    let isActive = false;
    let highlight: HTMLElement | null = null;
    let banner: HTMLElement | null = null;
    let lastHovered: Element | null = null;
    let activeHideCallback: ((selector: string) => void) | null = null;

    // Stack to keep track of zapped elements for Undo
    const zappedHistory: ZapperHistoryItem[] = [];

    function start(hideCallback: (selector: string) => void) {
        if (isActive) return;
        isActive = true;
        activeHideCallback = hideCallback;
        zappedHistory.length = 0; // Clear history on start
        createUI();
        attachListeners();
    }

    function stop() {
        if (!isActive) return;
        isActive = false;
        activeHideCallback = null;
        destroyUI();
        removeListeners();
    }

    function createUI() {
        highlight = document.createElement('div');
        highlight.id = 'zg-zapper-highlight';

        banner = document.createElement('div');
        banner.id = 'zg-zapper-banner';
        // Use inline styles to guarantee appearance
        banner.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; z-index: 2147483647;
            background-color: #1f2937; color: #f9fafb; padding: 10px;
            font-family: sans-serif; font-size: 14px; text-align: center;
            display: flex; justify-content: center; align-items: center; gap: 15px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        `;

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `⚡ <strong>Zapper Active</strong>`;
        textSpan.style.color = '#00E5FF';

        // Undo Button
        const undoBtn = document.createElement('button');
        undoBtn.id = 'zg-zapper-undo-btn';
        undoBtn.textContent = 'Undo Last';
        undoBtn.disabled = true;
        undoBtn.style.cssText = `
            background-color: #4b5563; color: white; border: 1px solid #6b7280;
            padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;
            opacity: 0.5; pointer-events: auto;
        `;
        undoBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleUndo();
        };

        // Exit Button
        const exitBtn = document.createElement('button');
        exitBtn.id = 'zg-zapper-exit-btn';
        exitBtn.textContent = 'Exit';
        exitBtn.style.cssText = `
            background-color: #ef4444; color: white; border: 1px solid #dc2626;
            padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;
            pointer-events: auto;
        `;
        exitBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            stop();
        };

        banner.appendChild(textSpan);
        banner.appendChild(undoBtn);
        banner.appendChild(exitBtn);

        document.body.appendChild(highlight);
        document.body.appendChild(banner);
    }

    function destroyUI() {
        if (banner) banner.remove();
        if (highlight) highlight.remove();
        highlight = null;
        banner = null;
    }

    function attachListeners() {
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
    }

    function removeListeners() {
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
    }

    function handleMouseOver(event: MouseEvent) {
        if (!isActive) return;
        const target = event.target as HTMLElement;

        // Don't highlight the banner or its buttons
        if (!target || target === banner || banner?.contains(target)) {
            if (highlight) highlight.style.display = 'none';
            return;
        }

        lastHovered = target;
        const rect = target.getBoundingClientRect();

        if (highlight) {
            Object.assign(highlight.style, {
                display: 'block',
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                top: `${rect.top + window.scrollY}px`,
                left: `${rect.left + window.scrollX}px`
            });
        }
    }

    function handleClick(event: MouseEvent) {
        if (!isActive) return;

        const target = event.target as HTMLElement;
        // Prevent zapping the UI itself
        if (!target || target === banner || banner?.contains(target) || target === highlight) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const selector = window.ZenithGuardSelectorGenerator.generate(target);

        if (selector && activeHideCallback) {
            // 1. Hide immediately
            target.style.display = 'none';
            target.classList.add('zg-zapped-temp');

            // 2. Save rule
            activeHideCallback(selector);

            // 3. Update History & UI
            zappedHistory.push({ element: target, selector: selector });
            updateUndoButton();

        } else {
            console.warn('ZenithGuard Zapper: Could not generate a unique selector.');
        }
    }

    async function handleUndo() {
        if (zappedHistory.length === 0) return;

        // Pop the last action
        const lastAction = zappedHistory.pop();
        if (!lastAction) return;

        const { element, selector } = lastAction;

        console.log(`ZenithGuard: Undoing zap for "${selector}"`);

        // 1. Visually restore immediately
        if (element) {
            // 'revert' with !important forces the browser to ignore the extension's stylesheet
            element.style.setProperty('display', 'revert', 'important');
            element.classList.remove('zg-zapped-temp');
        }

        // 2. Remove from storage
        const domain = window.location.hostname;
        const { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;

        if (customHidingRules[domain]) {
            // Filter out the rule we added
            const initialLength = customHidingRules[domain].length;
            customHidingRules[domain] = customHidingRules[domain].filter(r => r.value !== selector);

            if (customHidingRules[domain].length < initialLength) {
                await chrome.storage.sync.set({ customHidingRules });
                console.log("ZenithGuard: Rule removed from storage.");

                // 3. Notify background to update the stylesheet
                chrome.runtime.sendMessage({ type: 'REAPPLY_HIDING_RULES' });
            }
        }

        updateUndoButton();
    }

    function updateUndoButton() {
        const btn = document.getElementById('zg-zapper-undo-btn') as HTMLButtonElement | null;
        if (btn) {
            if (zappedHistory.length > 0) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = `Undo (${zappedHistory.length})`;
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.textContent = 'Undo';
            }
        }
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (!isActive) return;
        if (event.key === 'Escape') {
            stop();
        } else if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
            event.preventDefault();
            handleUndo();
        }
    }

    return { start, stop };
})();