import { getLocal, getSync } from "../shared/storage_api";
import { addToNetworkBlocklist, getNetworkLog, sendMessageSafely, selfHealRule } from "../shared/runtime_messages";
import { findMatchingRecordEntry, findMatchingRecordValue, listHasMatchingHostname } from "../shared/hostname_matching";
import { normalizeCustomHidingRuleBuckets } from "../shared/site_bucket_maps";
import { AiHider } from "./modules/AiHider";
import { BreachWarning } from "./modules/BreachWarning";
import { CosmeticFilter } from "./modules/CosmeticFilter";
import { Inspector } from "./modules/Inspector";
import { NextGenCleaner } from "./modules/NextGenCleaner";
import { PopupGuard } from "./modules/PopupGuard";
import { RedditMediaGuard } from "./modules/RedditMediaGuard";
import { clearProcessingToast, consumeTargetingContextMenuEvent } from "./modules/tool_runtime";
import { YouTubeGuard } from "./modules/YouTubeGuard";
import { Zapper } from "./modules/Zapper";
import { installToastUtils, showToast } from "./modules/toast";
import { generateUniqueSelector } from "./modules/selector";
import { validateContentMessage } from "../shared/content_messages";

function hasActiveRuntimeContext(): boolean {
    return typeof chrome.runtime?.id === "string" && chrome.runtime.id.length > 0;
}

function isAuthorizedSender(sender: chrome.runtime.MessageSender): boolean {
    const extensionRoot = chrome.runtime.getURL("");
    return sender.id === chrome.runtime.id || typeof sender.url === "string" && sender.url.startsWith(extensionRoot) || typeof sender.tab?.id === "number";
}

async function applyRecoveredState(filter: CosmeticFilter): Promise<void> {
    try {
        if (!hasActiveRuntimeContext()) {
            return;
        }

        const hostname = window.location.hostname;
        const [snapshot, localSnapshot] = await Promise.all([
            getSync<{
                customHidingRules?: Record<string, Array<{ value: string; enabled?: boolean; lastHealed?: number; lastHealAttempt?: number }>>;
                isSandboxedIframeEnabled?: boolean;
                isSelfHealingEnabled?: boolean;
                disabledSites?: string[];
                isProtectionEnabled?: boolean;
                persistentWallFixes?: Record<string, { enabled?: boolean; overlaySelector?: string; scrollSelector?: string; contentUnlockSelector?: string }>;
                isNextGenAIEradicatorEnabled?: boolean;
            }>([
                "customHidingRules",
                "isSandboxedIframeEnabled",
                "isSelfHealingEnabled",
                "disabledSites",
                "isProtectionEnabled",
                "persistentWallFixes",
                "isNextGenAIEradicatorEnabled",
            ]),
            getLocal<{
                temporaryWallFixes?: Record<string, { overlaySelector?: string; scrollSelector?: string; contentUnlockSelector?: string }>;
            }>("temporaryWallFixes"),
        ]);

        const disabledSites = Array.isArray(snapshot.disabledSites) ? snapshot.disabledSites : [];
        const protectionEnabled = snapshot.isProtectionEnabled !== false && !listHasMatchingHostname(disabledSites, hostname);
        const nextGenEnabled = snapshot.isNextGenAIEradicatorEnabled !== false;
        window.ZenithGuard_ProtectionEnabled = protectionEnabled;

        if (!protectionEnabled) {
            filter.stop();
            youTubeGuard?.stop();
            nextGenCleaner.stop();
            redditMediaGuard.stop();
            popupGuard.stop();
            return;
        }

        const rules = findMatchingRecordValue(snapshot.customHidingRules, hostname) || [];
        filter.applyHidingRules(rules, "custom");
        if (snapshot.isSelfHealingEnabled && rules.length > 0) {
            void attemptSelfHealRules(filter, rules, hostname);
        }

        const temporaryWallFix = findMatchingRecordValue(localSnapshot.temporaryWallFixes, hostname);
        const wallFix = findMatchingRecordValue(snapshot.persistentWallFixes, hostname);
        const activeWallFix = temporaryWallFix && typeof temporaryWallFix.overlaySelector === "string"
            ? temporaryWallFix
            : wallFix && wallFix.enabled !== false && typeof wallFix.overlaySelector === "string"
                ? wallFix
                : null;

        if (activeWallFix) {
            filter.applyWallFix({
                overlaySelector: activeWallFix.overlaySelector,
                scrollSelector: activeWallFix.scrollSelector,
                contentUnlockSelector: activeWallFix.contentUnlockSelector,
            });
        }

        if (snapshot.isSandboxedIframeEnabled) {
            filter.applyIframeSandboxing();
        }

        if (nextGenEnabled) {
            nextGenCleaner.start();
        } else {
            nextGenCleaner.stop();
        }
        redditMediaGuard.start();
        popupGuard.start();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("context invalidated")) {
            console.warn("ZenithGuard: Could not re-apply recovered content state.", error);
        }
    }
}

async function attemptSelfHealRules(
    filter: CosmeticFilter,
    rules: Array<{ value: string; enabled?: boolean; lastHealed?: number; lastHealAttempt?: number }>,
    hostname: string,
): Promise<void> {
    for (const [index, rule] of rules.entries()) {
        if (!rule.enabled || !rule.value) {
            continue;
        }

        const lastAttempt = rule.lastHealAttempt || 0;
        if (Date.now() - lastAttempt < 1440 * 60 * 1000) {
            continue;
        }

        if (document.readyState !== "complete") {
            await new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
        }

        if (document.querySelector(rule.value) !== null) {
            continue;
        }

        try {
            const response = await selfHealRule(rule.value, window.location.href);
            const snapshot = await getSync<{ customHidingRules?: Record<string, Array<{ value: string; enabled?: boolean; lastHealed?: number; lastHealAttempt?: number }>> }>(["customHidingRules"]);
            const customHidingRules = snapshot.customHidingRules || {};
            const matchingEntry = findMatchingRecordEntry(customHidingRules, hostname);
            if (!matchingEntry || !matchingEntry.value[index]) {
                continue;
            }

            customHidingRules[matchingEntry.key][index].lastHealAttempt = Date.now();
            if (response.newSelector) {
                customHidingRules[matchingEntry.key][index].value = response.newSelector;
                customHidingRules[matchingEntry.key][index].lastHealed = Date.now();
                const nextRules = normalizeCustomHidingRuleBuckets(customHidingRules);
                await chrome.storage.sync.set({ customHidingRules: nextRules });
                const nextMatchingEntry = findMatchingRecordEntry(nextRules, hostname);
                if (nextMatchingEntry) {
                    filter.applyHidingRules(nextMatchingEntry.value, "custom");
                }
                showToast({ message: "An old hiding rule was automatically repaired by AI.", type: "success" });
            } else {
                await chrome.storage.sync.set({ customHidingRules: normalizeCustomHidingRuleBuckets(customHidingRules) });
            }
        } catch {
            // Keep automatic self-heal failures quiet during page cleanup.
        }
    }
}

function executeCookieConsentAction(selector: string): void {
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) {
        showToast({ message: "Cookie banner control was not found on the page.", type: "error" });
        return;
    }

    try {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
    } catch {
        // Ignore scroll issues.
    }

    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.click();
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));

    document.documentElement.style.setProperty("overflow", "visible", "important");
    document.body.style.setProperty("overflow", "visible", "important");
    document.body.style.setProperty("position", "static", "important");
    document.body.style.setProperty("pointer-events", "auto", "important");

    showToast({ message: "Cookie banner action applied.", type: "success" });
}

function startQuickHide(filter: CosmeticFilter): void {
    const handler = async (event: MouseEvent): Promise<void> => {
        const target = event.target as HTMLElement | null;
        if (!target) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        document.removeEventListener("contextmenu", wrapped, true);

        const selector = generateUniqueSelector(target);
        if (!selector) {
            showToast({ message: "Could not generate a unique selector.", type: "error" });
            return;
        }

        await filter.saveHidingRule(selector, {
            tool: "Quick Hide",
            title: "Quick Hide Saved",
            message: "Saved a hiding rule for the element you targeted from the page.",
        });
        await applyRecoveredState(filter);
    };

    const wrapped = (event: MouseEvent): void => {
        void handler(event);
    };

    document.addEventListener("contextmenu", wrapped, { once: true, capture: true });
}

function startAiTargetedHide(initialContext?: { tag?: string; id?: string; classes?: string; text?: string }): void {
    if (initialContext) {
        aiHider.start({
            context: initialContext,
            onPreview: (selector) => filter.previewElement(selector, Boolean(selector)),
            onApply: async (selector) => {
                await filter.saveHidingRule(selector, {
                    tool: "Hide with AI",
                    title: "AI Hide Saved",
                    message: "Saved an AI-assisted hiding rule for the selected page element.",
                });
                await applyRecoveredState(filter);
            },
        });
        return;
    }

    const handler = (event: MouseEvent): void => {
        const target = consumeTargetingContextMenuEvent(event);
        if (!target) {
            return;
        }

        const context = {
            tag: target.tagName.toLowerCase(),
            id: target.id || undefined,
            classes: typeof target.className === "string" ? target.className : undefined,
            text: target.textContent?.trim().replace(/\s+/g, " ").substring(0, 200) || undefined,
        };

        aiHider.start({
            context,
            onPreview: (selector) => filter.previewElement(selector, Boolean(selector)),
            onApply: async (selector) => {
                await filter.saveHidingRule(selector, {
                    tool: "Hide with AI",
                    title: "AI Hide Saved",
                    message: "Saved an AI-assisted hiding rule for the selected page element.",
                });
                await applyRecoveredState(filter);
            },
        });

        document.removeEventListener("contextmenu", handler, true);
    };

    document.addEventListener("contextmenu", handler, { once: true, capture: true });
}

installToastUtils();

const filter = new CosmeticFilter(showToast);
const aiHider = new AiHider();
const breachWarning = new BreachWarning(showToast);
const nextGenCleaner = new NextGenCleaner();
const redditMediaGuard = new RedditMediaGuard();
const popupGuard = new PopupGuard();
const youTubeGuard = window.location.hostname === "www.youtube.com" ? YouTubeGuard.getInstance() : null;
const inspector = new Inspector({
    onSaveRule: async (selector) => {
        await filter.saveHidingRule(selector, {
            tool: "Inspector",
            title: "Inspector Hide Saved",
            message: "Saved a manual hiding rule from Inspector.",
        });
        await applyRecoveredState(filter);
    },
    onStartAiHide: (context) => startAiTargetedHide(context),
    loadNetworkLog: async () => {
        const result = await getNetworkLog();
        return result.entries;
    },
    onBlockDomain: async (domain) => {
        return addToNetworkBlocklist(domain, "inspector");
    },
    showToast,
});
const zapper = new Zapper({
    onSaveRule: (selector) => filter.saveHidingRule(selector, {
        tool: "Zapper",
        title: "Zapper Hide Saved",
        message: "Saved a hiding rule from Zapper cleanup.",
    }),
    onReapply: () => sendMessageSafely({ type: "REAPPLY_HIDING_RULES" }),
    showToast,
});

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    if (!isAuthorizedSender(sender)) {
        return false;
    }

    const validation = validateContentMessage(rawMessage);
    if (!validation.ok) {
        return false;
    }

    const message = validation.message;

    switch (message.type) {
        case "START_INSPECTOR_MODE":
            inspector.start(message.mode);
            sendResponse({ success: true });
            return false;
        case "START_ZAPPER_MODE":
            zapper.toggle();
            sendResponse({ success: true });
            return false;
        case "QUICK_HIDE_ELEMENT":
            startQuickHide(filter);
            sendResponse({ success: true });
            return false;
        case "START_AI_HIDING_TARGETED":
            startAiTargetedHide();
            sendResponse({ success: true });
            return false;
        case "REAPPLY_HIDING_RULES":
            void applyRecoveredState(filter).then(() => sendResponse({ success: true }));
            return true;
        case "EXECUTE_ADBLOCK_WALL_FIX":
            clearProcessingToast();
            sendResponse({ success: true, ...filter.executeAdblockWallFix(message.selectors) });
            return false;
        case "EXECUTE_COOKIE_CONSENT_ACTION":
            clearProcessingToast();
            executeCookieConsentAction(message.selector);
            sendResponse({ success: true });
            return false;
        case "SHOW_PROCESSING_TOAST":
            showToast({ message: message.message, type: "loading", id: "zg-processing-toast", duration: 0 });
            sendResponse({ success: true });
            return false;
        case "CLEAR_PROCESSING_TOAST":
            clearProcessingToast();
            sendResponse({ success: true });
            return false;
        case "SHOW_ERROR_TOAST":
            clearProcessingToast();
            showToast({ message: message.message, type: "error" });
            sendResponse({ success: true });
            return false;
        case "SHOW_BREACH_WARNING":
            breachWarning.setBreached(true);
            sendResponse({ success: true });
            return false;
        default:
            return false;
    }
});

youTubeGuard?.init(() => applyRecoveredState(filter));
void applyRecoveredState(filter);
