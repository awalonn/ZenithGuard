// inspector.js - Element Inspector Tool
// import { showToast } from '../utils/toast.js'; // This is now inlined below.

window.ZenithGuardInspector = (() => {
    
    /**
     * Displays a toast notification. Inlined from utils/toast.js to avoid module issues in content scripts.
     * @param {object} options - The options for the toast.
     * @param {string} options.message - The message to display.
     * @param {string} [options.type='success'] - The type of toast ('success', 'error', 'loading', 'info').
     * @param {number} [options.duration=3000] - Duration in ms. 0 for a persistent toast.
     * @param {string|null} [options.id=null] - An optional ID for the toast element.
     */
    const showToast = ({ message, type = 'success', duration = 3000, id = null }) => {
        let container = document.getElementById('zg-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'zg-toast-container';
            document.body.appendChild(container);
        }

        if (id) {
            const existingToast = document.getElementById(id);
            if (existingToast) existingToast.remove();
        }

        const toast = document.createElement('div');
        if (id) toast.id = id;
        toast.className = `zg-toast zg-toast-${type}`;
        
        const iconHtml = {
            success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`,
            error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>`,
            loading: `<div class="zg-toast-spinner"></div>`,
            info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>`
        }[type] || '';
        
        toast.innerHTML = `${iconHtml}<span>ZenithGuard: ${message}</span>`;
        
        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('hiding');
                toast.addEventListener('animationend', () => toast.remove(), { once: true });
            }, duration);
        }
    };

    let isActive = false;
    let highlight = null;
    let hud = null;
    let lastHovered = null;
    let networkLog = [];
    let hoverUpdateTimeout = null;
    let activeHideCallback = null;

    // --- Core Functions ---
    async function start(hideCallback) {
        if (isActive) return;
        isActive = true;
        activeHideCallback = hideCallback;
        
        try {
            networkLog = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG' });
            if (!Array.isArray(networkLog)) networkLog = [];
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
        clearTimeout(hoverUpdateTimeout);
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
        hud.addEventListener('mouseenter', handleHudMouseEnter);
        hud.addEventListener('click', handleHudClick, true);
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
    function handleMouseOver(event) {
        clearTimeout(hoverUpdateTimeout);
        hoverUpdateTimeout = setTimeout(() => {
            updateForTarget(event.target);
        }, 120);
    }
    
    function handleHudMouseEnter() {
        clearTimeout(hoverUpdateTimeout);
    }
    
    function handleHudClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target;

        if (target.classList.contains('zg-hud-block-btn') && !target.disabled) {
            const domain = target.dataset.domain;
            target.disabled = true; // Disable immediately
            chrome.runtime.sendMessage({ type: 'ADD_TO_NETWORK_BLOCKLIST', domain })
                .then(response => {
                    if (response && response.success) {
                        target.textContent = 'Blocked!';
                        showToast({ message: `${domain} added to blocklist.` });
                    } else {
                        target.disabled = false; // Re-enable on failure
                        showToast({ message: response.message || `Could not block ${domain}.`, type: 'error' });
                    }
                })
                .catch(err => {
                    target.disabled = false; // Re-enable on error
                    console.warn("ZenithGuard Inspector: Could not send block message.", err);
                    showToast({ message: 'Error communicating with extension.', type: 'error' });
                });
        } else if (target.classList.contains('zg-hud-quick-hide-btn') && !target.disabled) {
            if (lastHovered && activeHideCallback) {
                const selector = window.ZenithGuardSelectorGenerator.generate(lastHovered);
                if (selector) {
                    activeHideCallback(selector);
                    target.textContent = 'Hidden!';
                    target.disabled = true;
                    setTimeout(() => {
                        if (isActive && target) {
                            target.textContent = 'Quick Hide';
                            target.disabled = false;
                        }
                    }, 1500);
                } else {
                     showToast({ message: 'Could not generate a unique selector.', type: 'error' });
                }
            }
        } else if (target.classList.contains('zg-hud-ai-hide-btn')) {
             if (lastHovered) {
                const context = {
                    tag: lastHovered.tagName.toLowerCase(),
                    text: lastHovered.textContent.trim().replace(/\s+/g, ' ').substring(0, 200)
                };
                window.ZenithGuardAIHider.start((selector) => activeHideCallback(selector), context);
                stop();
            }
        }
    }


    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            stop();
        }
    }

    // --- Logic ---
    function updateForTarget(target) {
        if (!isActive || !target || target === hud || hud?.contains(target)) return;
        
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

    function findRequestsForElement(element) {
        const requests = new Map();
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
            } catch(e) { /* ignore invalid URLs in log */ }
        }

        return Array.from(requests.values());
    }


    function updateHud(element, rect) {
        const hudTop = rect.top + window.scrollY - hud.offsetHeight - 5;
        const hudLeft = rect.left + window.scrollX;
        hud.style.top = `${hudTop < 0 ? rect.bottom + window.scrollY + 5 : hudTop}px`;
        hud.style.left = `${Math.max(0, Math.min(window.innerWidth - hud.offsetWidth, hudLeft))}px`;

        const selector = window.ZenithGuardSelectorGenerator.generate(element) || '...';
        const selectorEl = hud.querySelector('.zg-hud-selector');
        selectorEl.textContent = selector;
        selectorEl.title = selector;

        const requests = findRequestsForElement(element);
        const requestListEl = hud.querySelector('.zg-hud-request-list');
        
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
            const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName) || element.hasAttribute('onclick') || element.getAttribute('role') === 'button';
            let message = '<div class="zg-hud-no-requests">No direct network requests found for this element.</div>';
            if (isInteractive) {
                message += '<div class="zg-hud-script-note">Note: Actions on this element may be handled by page-level scripts.</div>';
            }
            requestListEl.innerHTML = message;
        }
    }

    return { start, stop };
})();