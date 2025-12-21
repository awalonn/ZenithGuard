
import { AppSettings, HidingRule } from '../types.js';
import { YouTubeProtector } from './modules/YouTubeProtector.js';
import { SecurityGuard } from './modules/SecurityGuard.js';
import { CosmeticFilter } from './modules/CosmeticFilter.js';
import { CookieHandler } from './modules/CookieHandler.js';

(async () => {
    // --- State & Modules ---
    const securityGuard = new SecurityGuard();
    const cosmeticFilter = new CosmeticFilter();
    const cookieHandler = new CookieHandler();
    const youtubeProtector = YouTubeProtector.getInstance(); // Singleton

    const PROCESSING_TOAST_ID = 'zg-processing-toast';
    let isPerformanceModeEnabled = false;

    // --- Message Listener ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const actions: Record<string, (req: any) => void> = {
            'START_INSPECTOR_MODE': () => window.ZenithGuardInspector.start((s) => cosmeticFilter.saveHidingRule(s)),
            'START_ZAPPER_MODE': () => window.ZenithGuardZapper.start((s) => cosmeticFilter.saveHidingRule(s)),
            'QUICK_HIDE_ELEMENT': (req) => quickHideElement(req.targetElementId),
            'START_AI_HIDING_TARGETED': (req) => startTargetedAIHider(req.targetElementId),
            'PREVIEW_ELEMENT': (req) => cosmeticFilter.previewElement(req.selector, true),
            'CLEAR_PREVIEW': () => cosmeticFilter.previewElement(null, false),
            'PREVIEW_MANUAL_RULE': (req) => cosmeticFilter.previewManualRule(req.selector),
            'REAPPLY_HIDING_RULES': () => reapplyAllHidingRules(false),
            'EXECUTE_ADBLOCK_WALL_FIX': (req) => {
                console.log("ZenithGuard: Received EXECUTE_ADBLOCK_WALL_FIX message:", req.selectors);
                cosmeticFilter.executeAdblockWallFix(req.selectors);
            },
            'SHOW_PROCESSING_TOAST': (req) => showToast({ message: req.message, type: 'loading', id: PROCESSING_TOAST_ID, duration: 0 }),
            'SHOW_ERROR_TOAST': (req) => {
                const existingToast = document.getElementById(PROCESSING_TOAST_ID);
                if (existingToast) existingToast.remove();
                showToast({ message: req.message, type: 'error' });
            },
            'SHOW_BREACH_WARNING': () => securityGuard.setBreached(true)
        };

        const action = actions[request.type];
        if (action) {
            action(request);
            sendResponse({ success: true });
        }
        return true;
    });

    // --- Core Orchestration ---
    async function reapplyAllHidingRules(isInitialLoad = false) {
        try {
            const domain = window.location.hostname;
            const settings = await chrome.storage.sync.get([
                'customHidingRules', 'isCookieBannerHidingEnabled', 'isSelfHealingEnabled',
                'isPerformanceModeEnabled', 'isSandboxedIframeEnabled', 'disabledSites',
                'isProtectionEnabled', 'persistentWallFixes'
            ]) as AppSettings;

            const {
                customHidingRules = {},
                isCookieBannerHidingEnabled,
                isSelfHealingEnabled,
                isPerformanceModeEnabled: perfMode,
                isSandboxedIframeEnabled,
                disabledSites = [],
                isProtectionEnabled = true,
                persistentWallFixes = {}
            } = settings;


            if (!isProtectionEnabled || disabledSites.includes(domain)) {
                cosmeticFilter.applyHidingRules([], 'custom');
                cosmeticFilter.applyHidingRules([], 'filterList');
                if (!isProtectionEnabled) {
                    console.log("ZenithGuard: Global protection is OFF.");
                } else {
                    console.log("ZenithGuard: Disabled for this site.");
                }
                return;
            }

            isPerformanceModeEnabled = !!perfMode;

            // 1. Apply rules
            const rulesForDomain = customHidingRules[domain] || [];
            cosmeticFilter.applyHidingRules(rulesForDomain, 'custom');

            // 1.5 applying persistent wall fixes
            const fix = persistentWallFixes[domain];
            if (fix && fix.enabled) {
                console.log(`ZenithGuard: Applying persistent Defeat Wall fix for ${domain}:`, fix.overlaySelector);
                cosmeticFilter.applyWallFix(fix);
            }

            // 2. Sandboxing
            if (isSandboxedIframeEnabled) {
                cosmeticFilter.applyIframeSandboxing();
            }

            // 3. Startup Tasks
            if (isInitialLoad && !isPerformanceModeEnabled) {
                // Self healing kept local for now or TODO moved to module
                /* Temporarily disabling automatic AI triggers to preserve Gemini quota for v1.1.4 
                if (isCookieBannerHidingEnabled) {
                    cookieHandler.runAICookieHandler();
                }
                if (isSelfHealingEnabled) {
                    runSelfHealingCheck(rulesForDomain, domain);
                }
                */
            }

            // 4. Remote Filter Lists
            const response = await chrome.runtime.sendMessage({ type: 'GET_HIDING_RULES_FOR_DOMAIN', domain: domain });
            if (response && response.rules) {
                cosmeticFilter.applyHidingRules(response.rules, 'filterList');
            }

        } catch (e: any) {
            const errorMessage = String(e.message || e);
            if (!errorMessage.includes('context invalidated')) {
                console.warn("ZenithGuard: Could not re-apply hiding rules.", e);
            }
        }
    }

    // --- Legacy / Interactive Logic (To be refactored further if needed) ---

    // NOTE: Self-healing still here as it depends on local 'runSelfHealingCheck' recursion 
    // and storage interaction similar to saveHidingRule but slightly different.
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

                    if (response.newSelector) {
                        console.log(`ZenithGuard: AI proposed new selector: ${response.newSelector}`);
                        let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
                        if (!customHidingRules[domain] || !customHidingRules[domain][index]) continue;

                        customHidingRules[domain][index].value = response.newSelector;
                        customHidingRules[domain][index].lastHealed = Date.now();
                        customHidingRules[domain][index].lastHealAttempt = Date.now();
                        await chrome.storage.sync.set({ customHidingRules });

                        cosmeticFilter.applyHidingRules(customHidingRules[domain], 'custom'); // Use Module
                        showToast({ message: 'An old hiding rule was automatically repaired by AI.' });
                    }
                    // Update timestamp even if failed
                    let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
                    if (customHidingRules[domain] && customHidingRules[domain][index]) {
                        customHidingRules[domain][index].lastHealAttempt = Date.now();
                        await chrome.storage.sync.set({ customHidingRules });
                    }
                } catch (e) { }
            }
        }
    }

    function quickHideElement(targetElementId: any) {
        const listener = (e: MouseEvent) => {
            const target = e.target as Element;
            const selector = window.ZenithGuardSelectorGenerator.generate(target);
            if (selector) {
                cosmeticFilter.saveHidingRule(selector);
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
            window.ZenithGuardAIHider.start((s) => cosmeticFilter.saveHidingRule(s), context);
            document.removeEventListener('contextmenu', listener, { capture: true });
        };
        document.addEventListener('contextmenu', listener, { once: true, capture: true });
    }

    const showToast = (options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) => {
        if (window.ZenithGuardToastUtils && window.ZenithGuardToastUtils.showToast) {
            window.ZenithGuardToastUtils.showToast(options);
        }
    };

    // --- Initialization ---

    // 1. YouTube Protection (Inject ASAP)
    youtubeProtector.init(reapplyAllHidingRules);

    // 2. Initial Rules Application
    await reapplyAllHidingRules(true);

    // 3. Security Checks
    securityGuard.attachPasswordMonitor();

})();