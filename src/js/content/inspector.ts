// src/js/content/inspector.ts

interface NetworkRequest {
    url: string;
    status: string;
    [key: string]: any;
}

interface InspectorContext {
    tag: string;
    text: string;
}

window.ZenithGuardInspector = (() => {

    /**
     * Displays a toast notification. Inlined from utils/toast.js to avoid module issues in content scripts.
     * @param {object} options - The options for the toast.
     */
    const showToast = (options: { message: string, type?: 'success' | 'error' | 'info' | 'loading' }) => {
        if (window.ZenithGuardToastUtils && window.ZenithGuardToastUtils.showToast) {
            window.ZenithGuardToastUtils.showToast(options);
        } else {
            console.warn("ZenithGuard: Toast utility not found. Please reload the extension.");
        }
    };

    let isActive = false;
    let highlight: HTMLElement | null = null;
    let hud: HTMLElement | null = null;
    let lastHovered: Element | null = null;
    let networkLog: NetworkRequest[] = [];
    let hoverUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let activeHideCallback: ((selector: string) => void) | null = null;

    // --- Core Functions ---
    async function start(hideCallback: (selector: string) => void) {
        if (isActive) return;
        isActive = true;
        activeHideCallback = hideCallback;

        try {
            const log = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG' });
            if (Array.isArray(log)) {
                networkLog = log;
            } else {
                networkLog = [];
            }
        } catch (e) {
            console.error("ZenithGuard Inspector: Could not fetch network log.", e);
            networkLog = [];
        }

        createUI();
        attachListeners();
        showToast({ message: 'Inspector active. Use buttons to hide/block. Press ESC to exit.' });
    }

    function stop() {
        if (!isActive) return;
        isActive = false;
        activeHideCallback = null;
        if (hoverUpdateTimeout) clearTimeout(hoverUpdateTimeout);
        destroyUI();
        removeListeners();
    }

    // --- UI Management ---
    function createUI() {
        highlight = document.createElement('div');
        highlight.id = 'zg-inspector-highlight';

        hud = document.createElement('div');
        hud.id = 'zg-inspector-hud';
        hud.innerHTML = `
            <div class="zg-hud-header">
                <div class="zg-hud-selector" title="No element selected"></div>
                <div class="zg-hud-header-actions">
                    <button class="zg-hud-btn zg-hud-quick-hide-btn">Quick Hide</button>
                    <button class="zg-hud-btn zg-hud-ai-hide-btn">Advanced Hide (AI)</button>
                </div>
            </div>
            <div class="zg-hud-body">
                <div class="zg-hud-requests">
                    <h4>Associated Requests</h4>
                    <div class="zg-hud-request-list"></div>
                </div>
            </div>
            <div class="zg-hud-footer">
                <span class="zg-hud-exit-hint">Hover to select. Use buttons to hide or block. ESC to exit.</span>
            </div>
        `;
        document.body.appendChild(highlight);
        document.body.appendChild(hud);
    }

    function destroyUI() {
        hud?.remove();
        highlight?.remove();
        highlight = null;
        hud = null;
    }

    // --- Event Listeners ---
    function attachListeners() {
        hud?.addEventListener('mouseenter', handleHudMouseEnter);
        hud?.addEventListener('click', handleHudClick, true);
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('keydown', handleKeyDown, true);
    }

    function removeListeners() {
        hud?.removeEventListener('mouseenter', handleHudMouseEnter);
        hud?.removeEventListener('click', handleHudClick, true);
        document.removeEventListener('mouseover', handleMouseOver, true);
        document.removeEventListener('keydown', handleKeyDown, true);
    }

    // --- Event Handlers ---
    function handleMouseOver(event: MouseEvent) {
        if (hoverUpdateTimeout) clearTimeout(hoverUpdateTimeout);
        hoverUpdateTimeout = setTimeout(() => {
            updateForTarget(event.target as Element);
        }, 120);
    }

    function handleHudMouseEnter() {
        if (hoverUpdateTimeout) clearTimeout(hoverUpdateTimeout);
    }

    function handleHudClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLButtonElement | HTMLElement;

        if (target.classList.contains('zg-hud-block-btn')) {
            const btn = target as HTMLButtonElement;
            if (!btn.disabled) {
                const domain = btn.dataset.domain;
                if (!domain) return;

                btn.disabled = true; // Disable immediately
                chrome.runtime.sendMessage({ type: 'ADD_TO_NETWORK_BLOCKLIST', domain })
                    .then(response => {
                        if (response && response.success) {
                            btn.textContent = 'Blocked!';
                            showToast({ message: `${domain} added to blocklist.` });
                        } else {
                            btn.disabled = false; // Re-enable on failure
                            showToast({ message: response.message || `Could not block ${domain}.`, type: 'error' });
                        }
                    })
                    .catch(err => {
                        btn.disabled = false; // Re-enable on error
                        console.warn("ZenithGuard Inspector: Could not send block message.", err);
                        showToast({ message: 'Error communicating with extension.', type: 'error' });
                    });
            }
        } else if (target.classList.contains('zg-hud-quick-hide-btn') && 'disabled' in target && !target.disabled) {
            const btn = target as HTMLButtonElement;
            if (lastHovered && activeHideCallback) {
                const selector = window.ZenithGuardSelectorGenerator.generate(lastHovered);
                if (selector) {
                    activeHideCallback(selector);
                    btn.textContent = 'Hidden!';
                    btn.disabled = true;
                    setTimeout(() => {
                        if (isActive && btn) {
                            btn.textContent = 'Quick Hide';
                            btn.disabled = false;
                        }
                    }, 1500);
                } else {
                    showToast({ message: 'Could not generate a unique selector.', type: 'error' });
                }
            }
        } else if (target.classList.contains('zg-hud-ai-hide-btn')) {
            if (lastHovered) {
                const context: InspectorContext = {
                    tag: lastHovered.tagName.toLowerCase(),
                    text: lastHovered.textContent?.trim().replace(/\s+/g, ' ').substring(0, 200) || ''
                };
                if (activeHideCallback) {
                    window.ZenithGuardAIHider.start((selector) => activeHideCallback!(selector), context);
                }
                stop();
            }
        }
    }


    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            stop();
        }
    }

    // --- Logic ---
    function updateForTarget(target: Element) {
        if (!isActive || !target || target === hud || hud?.contains(target) || !highlight || !hud) return;

        lastHovered = target;
        const rect = lastHovered.getBoundingClientRect();

        Object.assign(highlight.style, {
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`
        });

        updateHud(lastHovered, rect);
    }

    function findRequestsForElement(element: Element): NetworkRequest[] {
        const requests = new Map<string, NetworkRequest>();
        if (!element || !networkLog || !Array.isArray(networkLog) || networkLog.length === 0) return [];

        const ownDomain = window.location.hostname;

        const parentIframe = element.closest('iframe');
        if (parentIframe && parentIframe.src) {
            try {
                const iframeSrc = new URL(parentIframe.src, window.location.href).href;
                const match = networkLog.find(req => req.url === iframeSrc);
                if (match) {
                    const domain = new URL(match.url).hostname;
                    if (domain !== ownDomain) {
                        requests.set(domain, match);
                    }
                }
            } catch (e) { /* ignore invalid iframe src */ }
        }

        const elementsToCheck = [element, ...Array.from(element.querySelectorAll('*'))];
        const htmlContent = elementsToCheck.map(el => el.outerHTML).join(' ').toLowerCase();

        for (const req of networkLog) {
            if (req.status === 'blocked') continue;
            try {
                const reqDomain = new URL(req.url).hostname;
                if (reqDomain === ownDomain || requests.has(reqDomain)) continue;

                if (htmlContent.includes(req.url.toLowerCase())) {
                    requests.set(reqDomain, req);
                    continue;
                }

                const domainParts = reqDomain.split('.').filter(p => p !== 'www' && p.length > 3);
                if (domainParts.some(part => htmlContent.includes(part))) {
                    requests.set(reqDomain, req);
                    continue;
                }
            } catch (e) { /* ignore invalid URLs in log */ }
        }

        return Array.from(requests.values());
    }


    function updateHud(element: Element, rect: DOMRect) {
        if (!hud) return;
        const hudTop = rect.top + window.scrollY - hud.offsetHeight - 5;
        const hudLeft = rect.left + window.scrollX;
        hud.style.top = `${hudTop < 0 ? rect.bottom + window.scrollY + 5 : hudTop}px`;
        hud.style.left = `${Math.max(0, Math.min(window.innerWidth - hud.offsetWidth, hudLeft))}px`;

        const selector = window.ZenithGuardSelectorGenerator.generate(element) || '...';
        const selectorEl = hud.querySelector('.zg-hud-selector') as HTMLElement;
        if (selectorEl) {
            selectorEl.textContent = selector;
            selectorEl.title = selector;
        }

        const requests = findRequestsForElement(element);
        const requestListEl = hud.querySelector('.zg-hud-request-list');

        if (requestListEl) {
            if (requests.length > 0) {
                requestListEl.innerHTML = requests.map(req => {
                    const domain = new URL(req.url).hostname;
                    const isBlocked = req.status === 'blocked';
                    return `
                        <div class="zg-hud-request-item" title="${req.url}">
                            <span class="domain">${domain}</span>
                            <button class="zg-hud-btn zg-hud-block-btn" data-domain="${domain}" ${isBlocked ? 'disabled' : ''}>
                                ${isBlocked ? 'Blocked' : 'Block'}
                            </button>
                        </div>
                    `;
                }).join('');
            } else {
                const tagName = element.tagName.toLowerCase();
                // @ts-ignore - onclick check is heuristic
                const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName) || element.hasAttribute('onclick') || element.getAttribute('role') === 'button';
                let message = '<div class="zg-hud-no-requests">No direct network requests found for this element.</div>';
                if (isInteractive) {
                    message += '<div class="zg-hud-script-note">Note: Actions on this element may be handled by page-level scripts.</div>';
                }
                requestListEl.innerHTML = message;
            }
        }
    }

    return { start, stop };
})();