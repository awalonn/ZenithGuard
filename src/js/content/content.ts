// src/js/content/content.ts
import { AppSettings, HidingRule } from '../types.js';

(async () => {

    // --- Helper for shared toast utility ---
    const showToast = (options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) => {
        if (window.ZenithGuardToastUtils && window.ZenithGuardToastUtils.showToast) {
            window.ZenithGuardToastUtils.showToast(options);
        } else {
            console.warn("ZenithGuard: Toast utility not found. Please reload the extension.");
        }
    };

    // --- Breach Warning Logic ---
    let isBreachedSite = false;

    function showBreachWarningBanner() {
        const sessionKey = `zg-breach-dismissed-${window.location.hostname}`;
        if (sessionStorage.getItem(sessionKey)) {
            return; // Dismissed for this session
        }

        const warningEl = document.createElement('div');
        warningEl.className = 'zenithguard-breach-warning';
        warningEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.22 1.754a.75.75 0 011.56 0l4.25 8.5a.75.75 0 01-.655.996h-8.5a.75.75 0 01-.655-.996l4.25-8.5zM9 9a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 019 9zm0 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
            <span><strong>Security Alert:</strong> This site has a known history of data breaches. Be careful with your passwords and personal information.</span>
            <button class="z-dismiss-btn" title="Dismiss">&times;</button>
        `;

        const dismissBtn = warningEl.querySelector('.z-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                warningEl.remove();
                sessionStorage.setItem(sessionKey, 'true');
            });
        }

        document.body.prepend(warningEl);
    }

    // Active Password Field Monitor
    function attachPasswordMonitor() {
        document.addEventListener('focusin', (e) => {
            const target = e.target as HTMLElement;
            if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password') {
                if (isBreachedSite) {
                    showToast({
                        message: "Warning: This site has a known data breach. Do not re-use an old password!",
                        type: "error",
                        duration: 6000
                    });
                }
            }
        });
    }

    // --- State ---
    let isPerformanceModeEnabled = false;
    const PROCESSING_TOAST_ID = 'zg-processing-toast';

    // --- Message Listener ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const actions: Record<string, (req: any) => void> = {
            'START_INSPECTOR_MODE': () => window.ZenithGuardInspector.start(saveHidingRule),
            'START_ZAPPER_MODE': () => window.ZenithGuardZapper.start(saveHidingRule),
            'QUICK_HIDE_ELEMENT': (req) => quickHideElement(req.targetElementId),
            'START_AI_HIDING_TARGETED': (req) => startTargetedAIHider(req.targetElementId),
            'PREVIEW_ELEMENT': (req) => previewElement(req.selector, true),
            'CLEAR_PREVIEW': () => previewElement(null, false),
            'PREVIEW_MANUAL_RULE': (req) => previewManualRule(req.selector),
            'REAPPLY_HIDING_RULES': () => reapplyAllHidingRules(false),
            'EXECUTE_ADBLOCK_WALL_FIX': (req) => executeAdblockWallFix(req.selectors),
            'SHOW_PROCESSING_TOAST': (req) => showToast({ message: req.message, type: 'loading', id: PROCESSING_TOAST_ID, duration: 0 }),
            'SHOW_ERROR_TOAST': (req) => {
                const existingToast = document.getElementById(PROCESSING_TOAST_ID);
                if (existingToast) existingToast.remove();
                showToast({ message: req.message, type: 'error' });
            },
            'SHOW_BREACH_WARNING': (req) => {
                isBreachedSite = true; // Set flag for active monitor
                showBreachWarningBanner();
            }
        };

        const action = actions[request.type];
        if (action) {
            action(request);
            sendResponse({ success: true });
        }
        return true; // Keep message channel open for async responses
    });

    // --- Core Functions ---

    async function reapplyAllHidingRules(isInitialLoad = false) {
        try {
            const domain = window.location.hostname;
            const settings = await chrome.storage.sync.get([
                'customHidingRules', 'isCookieBannerHidingEnabled', 'isSelfHealingEnabled',
                'isPerformanceModeEnabled', 'isSandboxedIframeEnabled', 'disabledSites',
                'isProtectionEnabled'
            ]) as AppSettings;

            const {
                customHidingRules = {},
                isCookieBannerHidingEnabled,
                isSelfHealingEnabled,
                isPerformanceModeEnabled: perfMode,
                isSandboxedIframeEnabled,
                disabledSites = [],
                isProtectionEnabled = true
            } = settings;

            // If protection is globally OFF OR this site is whitelisted, remove all hiding rules.
            if (!isProtectionEnabled || disabledSites.includes(domain)) {
                applyHidingRules([], 'custom');
                applyHidingRules([], 'filterList');
                if (!isProtectionEnabled) {
                    console.log("ZenithGuard: Global protection is OFF. Removing cosmetic rules.");
                } else {
                    console.log("ZenithGuard: Cosmetic filtering disabled for this site.");
                }
                return;
            }

            isPerformanceModeEnabled = !!perfMode;

            // 1. Apply custom rules from storage
            const rulesForDomain = customHidingRules[domain] || [];
            applyHidingRules(rulesForDomain, 'custom');

            // 2. Apply Sandboxed iFrame Protection
            if (isSandboxedIframeEnabled) {
                applyIframeSandboxing();
            }

            // 3. Run startup tasks on initial load only
            if (isInitialLoad && !isPerformanceModeEnabled) {
                if (isSelfHealingEnabled) {
                    runSelfHealingCheck(rulesForDomain, domain);
                }
                if (isCookieBannerHidingEnabled) {
                    runAICookieHandler();
                }
            }

            // 4. Get and apply filter list rules
            const response = await chrome.runtime.sendMessage({ type: 'GET_HIDING_RULES_FOR_DOMAIN', domain: domain });
            if (response && response.rules) {
                applyHidingRules(response.rules, 'filterList');
            }
        } catch (e: any) {
            const errorMessage = String(e.message || e);
            if (errorMessage.includes('context invalidated') || errorMessage.includes('Cannot read properties of undefined')) {
                console.log("ZenithGuard: Context invalidated on navigation. Halting stale script.");
            } else {
                console.warn("ZenithGuard: Could not re-apply hiding rules.", e);
            }
        }
    }

    // --- NEW: Dedicated YouTube Cosmetic Hider ---
    function hideYouTubeAdElements() {
        const styleId = 'zenithguard-youtube-cosmetic-styles';
        let styleSheet = document.getElementById(styleId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        }

        const selectors = [
            '.video-ads', '.ytp-ad-module', '.ytp-ad-player-overlay',
            '.ytp-ad-image-overlay', '.ytp-ad-text-overlay',
            'ytd-promoted-sparkles-web-renderer', 'ytd-display-ad-renderer',
            'ytd-promoted-video-renderer', 'ytd-in-feed-ad-layout-renderer',
            'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-text-search-renderer',
            '.ytp-ad-skip-button-container', '.ytp-ad-preview-container',
            '#player-ads', '#masthead-ad', '.ytp-paid-content-overlay'
        ];

        styleSheet.textContent = `${selectors.join(', ')} { display: none !important; }`;
    }

    // --- NEW: YouTube Ad Interceptor Injection ---
    function injectYouTubeAdInterceptor() {
        if (document.getElementById('zenithguard-yt-interceptor')) {
            return;
        }
        try {
            const script = document.createElement('script');
            script.id = 'zenithguard-yt-interceptor';
            script.src = chrome.runtime.getURL('js/content/yt_interceptor.js');
            (document.head || document.documentElement).appendChild(script);
            script.onload = () => {
                script.remove();
            };
        } catch (e: any) {
            const errorMessage = String(e.message || e);
            if (errorMessage.includes('context invalidated') || errorMessage.includes('Cannot read properties of undefined')) {
                console.log("ZenithGuard: Context invalidated on navigation. Halting stale interceptor script.");
            } else {
                console.warn("ZenithGuard: Could not inject YT interceptor.", e);
            }
        }
    }


    // --- Persistent Observer for YouTube (UPGRADED) ---
    function observeYouTubeDOMChanges() {
        if (window.location.hostname !== 'www.youtube.com') {
            return;
        }

        if (!document.body) {
            window.addEventListener('DOMContentLoaded', initializeObserver, { once: true });
            return;
        }
        initializeObserver();
    }

    function initializeObserver() {
        injectYouTubeAdInterceptor();
        hideYouTubeAdElements();

        let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
        const observer = new MutationObserver((mutations) => {
            if (debounceTimeout) clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                reapplyAllHidingRules(false);
                hideYouTubeAdElements();
                injectYouTubeAdInterceptor();
            }, 150);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log("ZenithGuard: Persistent cosmetic filtering & ad interception enabled for YouTube.");
    }

    // --- Rule Application & Management ---
    function applyHidingRules(rules: HidingRule[], source: string) {
        if (!rules || rules.length === 0) {
            const styleId = `zenithguard-styles-${source}`;
            const styleSheet = document.getElementById(styleId);
            if (styleSheet) styleSheet.textContent = '';
            return;
        }

        const styleId = `zenithguard-styles-${source}`;
        let styleSheet = document.getElementById(styleId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        }

        const enabledRules = rules.filter(r => r.enabled).map(r => r.value);
        if (enabledRules.length > 0) {
            const selector = enabledRules.join(', ');
            styleSheet.textContent = `${selector}:not(#zg-zapper-highlight):not(#zg-inspector-highlight) { display: none !important; }`;
        } else {
            styleSheet.textContent = '';
        }
    }

    async function saveHidingRule(selector: string) {
        try {
            const domain = window.location.hostname;
            let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
            if (!customHidingRules[domain]) customHidingRules[domain] = [];

            if (!customHidingRules[domain].some(r => r.value === selector)) {
                customHidingRules[domain].push({ value: selector, enabled: true });
                await chrome.storage.sync.set({ customHidingRules });
                showToast({ message: 'Hiding rule saved!' });
            } else {
                showToast({ message: 'This hiding rule already exists.' });
            }
        } catch (e: any) {
            const errorMessage = String(e.message || e);
            if (errorMessage.includes('Extension context invalidated.')) {
                showToast({ message: 'Extension was reloaded. Please try again.', type: 'error' });
            } else {
                console.error("ZenithGuard: Failed to save hiding rule.", e);
                showToast({ message: 'Failed to save rule.', type: 'error' });
            }
        }
    }

    // --- NEW: iFrame Sandboxing ---
    function applyIframeSandboxing() {
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


    // --- Self-Healing Logic for Broken Rules ---
    async function runSelfHealingCheck(rules: HidingRule[], domain: string) {
        for (const [index, rule] of rules.entries()) {
            if (!rule.enabled || !rule.value) continue;
            const lastChecked = rule.lastHealAttempt || 0;
            const oneDay = 24 * 60 * 60 * 1000;
            if (Date.now() - lastChecked < oneDay) continue;

            if (document.readyState !== 'complete') {
                await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
            }

            if (document.querySelector(rule.value) === null) {
                console.log(`ZenithGuard: Broken selector detected: ${rule.value}. Attempting to self-heal.`);

                try {
                    const response = await chrome.runtime.sendMessage({
                        type: 'SELF_HEAL_RULE',
                        data: { selector: rule.value, pageUrl: window.location.href }
                    });

                    if (response.error) {
                        console.warn(`ZenithGuard: AI self-heal failed for ${rule.value}. Error: ${response.error}`);
                    } else if (response.newSelector) {
                        console.log(`ZenithGuard: AI proposed new selector: ${response.newSelector}`);
                        let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
                        if (!customHidingRules[domain] || !customHidingRules[domain][index]) continue;

                        customHidingRules[domain][index].value = response.newSelector;
                        customHidingRules[domain][index].lastHealed = Date.now();
                        customHidingRules[domain][index].lastHealAttempt = Date.now();

                        await chrome.storage.sync.set({ customHidingRules });

                        applyHidingRules(customHidingRules[domain], 'custom');
                        if (response.newSelector) showToast({ message: 'An old hiding rule was automatically repaired by AI.' });
                    }

                    let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
                    if (customHidingRules[domain] && customHidingRules[domain][index]) {
                        customHidingRules[domain][index].lastHealAttempt = Date.now();
                        await chrome.storage.sync.set({ customHidingRules });
                    }
                } catch (e: any) {
                    const errorMessage = String(e.message || e);
                    if (!errorMessage.includes('Extension context invalidated.') && !errorMessage.includes('Cannot read properties of undefined')) {
                        console.warn(`ZenithGuard: Error during self-heal message: ${errorMessage}`);
                    }
                }
            }
        }
    }


    // --- Interactive Tools ---
    function quickHideElement(targetElementId: any) {
        // targetElementId isn't really used since we need the event target
        // But for context menu actions we might need to handle it differently.
        // For now relying on immediate context menu right-click target which is captured by the listener.
        const listener = (e: MouseEvent) => {
            const target = e.target as Element;
            const selector = window.ZenithGuardSelectorGenerator.generate(target);
            if (selector) {
                saveHidingRule(selector);
            }
            document.removeEventListener('contextmenu', listener, { capture: true });
        };
        document.addEventListener('contextmenu', listener, { once: true, capture: true });
    }

    function startTargetedAIHider(targetElementId: any) {
        const listener = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const context = {
                tag: target.tagName.toLowerCase(),
                id: target.id,
                classes: target.className,
                text: target.textContent?.trim().replace(/\s+/g, ' ').substring(0, 200) || ''
            };
            window.ZenithGuardAIHider.start(saveHidingRule, context);
            document.removeEventListener('contextmenu', listener, { capture: true });
        };
        document.addEventListener('contextmenu', listener, { once: true, capture: true });
    }

    function previewElement(selector: string | null, isPreviewing: boolean) {
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

    // NEW: Function to handle temporary highlight for manual rule addition
    function previewManualRule(selector: string) {
        const styleId = 'zenithguard-manual-preview-style';
        let styleSheet = document.getElementById(styleId);
        if (styleSheet) styleSheet.remove(); // Clear any previous preview

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

        // Remove the highlight after a short period
        setTimeout(() => {
            const sheet = document.getElementById(styleId);
            if (sheet) sheet.remove();
        }, 2500);
    }


    // --- Adblock Wall Defeater ---
    function executeAdblockWallFix(selectors: { overlaySelector: string, scrollSelector?: string }) {
        // First, remove the "processing" toast
        const processingToast = document.getElementById(PROCESSING_TOAST_ID);
        if (processingToast) processingToast.remove();

        const { overlaySelector, scrollSelector } = selectors;
        if (!overlaySelector) return;

        const styleId = 'zenithguard-adblock-wall-fix';
        let styleSheet = document.getElementById(styleId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            (document.head || document.documentElement).appendChild(styleSheet);
        }

        let cssText = `${overlaySelector} { display: none !important; opacity: 0 !important; pointer-events: none !important; }`;
        if (scrollSelector) {
            cssText += `\n${scrollSelector} { overflow: visible !important; position: static !important; }`;
        }

        styleSheet.textContent = cssText;
        showToast({ message: 'AI Anti-Adblock Wall activated.' });
    }

    // --- NEW: AI Cookie Banner Handling ---
    function runAICookieHandler() {
        setTimeout(async () => {
            try {
                const response = await chrome.runtime.sendMessage({ type: 'HANDLE_COOKIE_CONSENT' });
                if (response.error) {
                    console.log(`ZenithGuard AI Cookie Consent: ${response.error}`);
                    return;
                }

                const { selector, action } = response.result;
                if (!selector) return;

                try {
                    const element = document.querySelector(selector) as HTMLElement;
                    if (element && isElementVisible(element)) {
                        element.click();
                        const message = action === 'REJECT' ?
                            'AI rejected tracking cookies for you.' :
                            'AI accepted cookies for you.';
                        showToast({ message });
                    } else if (element) {
                        console.log(`ZenithGuard AI Cookie Consent: Found selector "${selector}", but element was not visible or clickable.`);
                    }
                } catch (e: any) {
                    console.warn(`ZenithGuard AI Cookie Consent: AI returned an invalid selector "${selector}". Error: ${e.message}`);
                }

            } catch (error: any) {
                const errorMessage = String(error.message || error);
                if (!errorMessage.includes('Extension context invalidated.') && !errorMessage.includes('Cannot read properties of undefined')) {
                    console.warn(`ZenithGuard AI Cookie Consent failed: ${errorMessage}`);
                }
            }
        }, 2000);
    }

    // --- Initial Setup ---
    // Fetch initial settings and apply initial rules
    await reapplyAllHidingRules(true);

    // Start observing YouTube for dynamic content changes
    observeYouTubeDOMChanges();

    // Start password monitor
    attachPasswordMonitor();

    // --- Utilities ---
    function isElementVisible(el: HTMLElement) {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }
})();