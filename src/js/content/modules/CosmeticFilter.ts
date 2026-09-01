import { getLocal, getSync, setLocal, setSync } from "../../shared/storage_api";
import { findMatchingRecordEntry } from "../../shared/hostname_matching";
import { normalizeCustomHidingRuleBuckets } from "../../shared/site_bucket_maps";
import { isGoogleIdentityHostname } from "../../shared/google_identity";
import type { ToastOptions } from "./toast";

export type HidingRule = {
    value: string;
    enabled?: boolean;
    lastHealed?: number;
    lastHealAttempt?: number;
};

export type WallFixSelectors = {
    overlaySelector: string;
    scrollSelector?: string;
    contentUnlockSelector?: string;
};

export type WallFixApplyResult = {
    overlayMatchCount: number;
    contentUnlockMatchCount: number;
};

export type HidingRuleActivity = {
    tool: string;
    title?: string;
    message?: string;
    tone?: "info" | "success" | "error";
};

type CleanupCollapseResult = {
    count: number;
    hints: string[];
};

type CosmeticCleanupSummary = {
    count: number;
    latestHint?: string;
    updatedAt: number;
    pageUrl?: string;
};

export function findMatchingRuleBucketKey<T>(hostname: string, entries: Record<string, T> | undefined): string | null {
    return findMatchingRecordEntry(entries, hostname)?.key || null;
}

function normalizeActivityHostname(hostname: string): string {
    const normalized = String(hostname || "").trim().toLowerCase();
    return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

const BUILT_IN_AD_SLOT_CLEANUP_SELECTORS = [
    ".mgid-display-box",
    '[class*="adskeeper"]',
    '[id*="M741130"]',
    ".mgbox",
    ".mg-display-box",
    '[id^="MarketGid"]',
    '[id^="adskeeper"]',
    "div[data-ads-id]",
    ".adskeeper-container",
    ".freestar-ad",
    'ins.adsbygoogle[data-ad-status="unfilled"]',
    "ins.adsbygoogle:empty",
    'iframe[id^="google_ads_iframe"]',
    'iframe[name^="google_ads_iframe"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googletagservices.com"]',
    'iframe[src*="googleads."]',
    'div[id^="google_ads_iframe"]',
    '[id^="google_ads_iframe_"]',
    '[id^="aswift_"]',
    '[id^="google_ads_frame"]',
    ".adsbygoogle-noablate",
    '[data-ad-status="unfilled"]',
    ".google-auto-placed",
    "[data-ad-client]",
    "[data-ad-slot]",
    '[id^="div-gpt-ad"]',
    '[id*="div-gpt-ad-"]',
    '[id^="ad_page_"]',
    ".responsive-sda.ad-center",
    '[class*="mm-ads-"]',
    ".header-and-footer--banner-ad",
    ".adsninja-ad-zone",
    '[id^="dynamically-injected-refresh-ad-zone-"]',
    '[id^="ad-zone-container-adsninja-ad-unit-"]',
    '[id^="ad-zone-size-container-adsninja-ad-unit-"]',
    '.ad-zone[class*="ad-zone-content-"]',
    '.ad-zone[class*="ad-zone-footer-"]',
    ".side-ad-trail",
    ".ad-wrapper.pgQSsticky",
    ".zad.billboard",
    ".zad.halfpage",
    ".ad-container.desktop",
    ".ad.gam",
    ".ad.ad--container",
    ".widget_nypost_dfp_ad_widget",
    ".mol-ads-label-container",
    ".mol-ads-label",
    ".above-header-ad",
    "#adm-leaderboard",
    '[id^="gpt-"][class*="ad"]',
    ".site-header-ad-wrapper",
    ".wp-block-the-wrap-ad",
    ".yad-skin-ad-top",
    "#bottom-adhesion",
    '[id^="ad-pos-"]',
    ".c-adSkyBox",
];

const BUILT_IN_AD_CONTAINER_CLEANUP_SELECTORS = [
    ".adsbygoogle",
    ".google-auto-placed",
    ".adskeeper-container",
    ".freestar-ad",
    ".mgid-display-box",
    ".mgbox",
    ".mg-display-box",
    '[id^="div-gpt-ad"]',
    '[id*="div-gpt-ad-"]',
    '[id*="leaderboard"]',
    '[class*="leaderboard"]',
    '[class*="mm-ads-"]',
    ".header-and-footer--banner-ad",
    ".adsninja-ad-zone",
    '[id^="ad-zone-container-adsninja-ad-unit-"]',
    '[id^="ad-zone-size-container-adsninja-ad-unit-"]',
    ".side-ad-trail",
    ".ad-wrapper",
    ".zad.billboard",
    ".zad.halfpage",
    ".ad-container.desktop",
    ".ad.gam",
    ".ad.ad--container",
    ".widget_nypost_dfp_ad_widget",
    ".mol-ads-label-container",
    ".mol-ads-label",
    ".above-header-ad",
    "#adm-leaderboard",
    '[id^="gpt-"][class*="ad"]',
    ".site-header-ad-wrapper",
    ".wp-block-the-wrap-ad",
    ".yad-skin-ad-top",
    "#bottom-adhesion",
    '[id^="ad-pos-"]',
    ".c-adSkyBox",
    '[class*="Ad-module-scss-module"][class*="__ad"]',
    '[class*="ad-container"]',
    '[class*="ad-slot"]',
    '[class*="ad_slot"]',
    '[class*="ad-unit"]',
    '[class*="adunit"]',
    '[class*="video-ad"]',
    '[class*="ad-video"]',
    '[class*="preroll"]',
    '[class*="pre-roll"]',
    '[class*="midroll"]',
    '[class*="outstream"]',
    '[class*="instream"]',
    '[class*="vpaid"]',
    '[class*="ima-ad"]',
    '[id*="ad-container"]',
    '[id*="ad-slot"]',
    '[id*="ad_unit"]',
    '[id*="video-ad"]',
    '[id*="ad-video"]',
    '[id*="preroll"]',
    '[id*="pre-roll"]',
    '[id*="midroll"]',
    '[id*="outstream"]',
    '[id*="instream"]',
    '[id*="vpaid"]',
    "[data-ad-client]",
    "[data-ad-slot]",
    "[data-ad-unit]",
    "[data-ad-unit-path]",
];

const BUILT_IN_AD_CONTAINER_HINTS = [
    "adsbygoogle",
    "google_ads",
    "google-ads",
    "div-gpt-ad",
    "ad-slot",
    "adslot",
    "ad-container",
    "advert",
    "banner-ad",
    "leaderboard",
    "freestar-ad",
    "mm-ads",
    "adsninja-ad",
    "ad-zone",
    "side-ad",
    "ad-wrapper",
    "zad",
    "ad gam",
    "nypost_dfp_ad",
    "mol-ads-label",
    "above-header-ad",
    "adm-leaderboard",
    "wp-block-the-wrap-ad",
    "yad-skin-ad",
    "ad-module-scss-module",
    "bottom-adhesion",
    "ad-pos-",
    "c-adskybox",
    "video-ad",
    "ad-video",
    "preroll",
    "pre-roll",
    "midroll",
    "outstream",
    "instream",
    "vpaid",
    "ima-ad",
    "sponsor",
    "promoted",
];

const BUILT_IN_CLEANUP_MUTATION_HINTS = [
    ...BUILT_IN_AD_CONTAINER_HINTS,
    "adsbygoogle",
    "google_ads_iframe",
    "doubleclick",
    "googlesyndication",
    "googletagservices",
    "googleads",
    "aswift",
    "gpt",
    "freestar",
    "responsive-sda",
    "ad-center",
    "adsninja",
    "ad-pos",
    "adskybox",
    "bottomads",
    "data-text-ad",
    "tads",
];

const AD_ONLY_TEXT_PATTERNS = [
    /^(?:ad|ads|advertisement|advertisements|sponsored|sponsor|promoted)$/i,
    /^(?:skip|skip ad|skip ads)(?:\s+\d+)?(?:\s*[^\w\s]+)?$/i,
    /^(?:close|close ad|close ads|x)(?:\s*[^\w\s]+)?$/i,
    /^(?:advertisement\s+)?(?:skip|skip ad|skip ads)(?:\s+\d+)?(?:\s*[^\w\s]+)?$/i,
];

export class CosmeticFilter {
    private aggressiveRules = new Set<string>();
    private wallFixObserver: MutationObserver | null = null;
    private observerTimeout: number | null = null;
    private builtInCleanupObserver: MutationObserver | null = null;
    private builtInCleanupObservedRoots = new WeakSet<Node>();
    private builtInCleanupTimeout: number | null = null;
    private builtInCleanupActivityTimeout: number | null = null;
    private pendingBuiltInCleanupActivityCount = 0;
    private pendingBuiltInCleanupHints = new Set<string>();
    private lastBuiltInCleanupActivityAt = 0;
    private activeWallFix: WallFixSelectors | null = null;

    constructor(private readonly showToast: (options: ToastOptions) => void) {}

    private async appendToolActivity(hostname: string, activity: HidingRuleActivity): Promise<void> {
        const snapshot = await getLocal<{ toolActivityLog?: Array<{
            tool: string;
            title: string;
            message: string;
            tone: "info" | "success" | "error";
            timestamp: number;
            domain?: string;
        }> }>("toolActivityLog");
        const current = snapshot && Array.isArray(snapshot.toolActivityLog) ? snapshot.toolActivityLog : [];

        await setLocal({
            toolActivityLog: [
                {
                    tool: activity.tool,
                    title: activity.title || `${activity.tool} Saved`,
                    message: activity.message || "Saved a hiding rule for this page element.",
                    tone: activity.tone || "success",
                    timestamp: Date.now(),
                    domain: normalizeActivityHostname(hostname),
                },
                ...current,
            ].slice(0, 25),
        });
    }

    private async persistCosmeticCleanupSummary(hostname: string, summary: CosmeticCleanupSummary): Promise<void> {
        const normalizedHostname = normalizeActivityHostname(hostname);
        const snapshot = await getLocal<{ cosmeticCleanupSummaryByHostname?: Record<string, CosmeticCleanupSummary> }>("cosmeticCleanupSummaryByHostname");
        const current = snapshot && snapshot.cosmeticCleanupSummaryByHostname && typeof snapshot.cosmeticCleanupSummaryByHostname === "object"
            ? snapshot.cosmeticCleanupSummaryByHostname
            : {};

        await setLocal({
            cosmeticCleanupSummaryByHostname: {
                ...current,
                [normalizedHostname]: summary,
            },
        });
    }

    applyHidingRules(rules: HidingRule[], scope: "custom" | "default" | "filterList"): void {
        const styleId = `zenithguard-styles-${scope}`;
        let style = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
        }

        const activeRules = rules.filter((rule) => rule.enabled !== false && rule.value);
        const builtInCleanup = BUILT_IN_AD_SLOT_CLEANUP_SELECTORS.join(", ");
        if (activeRules.length === 0) {
            style.textContent = `${builtInCleanup} { display: none !important; }`;
            if (scope === "custom") {
                this.stopAggressiveFiltering();
            }
            this.runBuiltInAdSlotCleanup();
            return;
        }

        const filteredSelectors = activeRules
            .map((rule) => rule.value)
            .filter((selector) => !selector.includes(".ytp-ad-skip-button"));

        const combined = filteredSelectors.length > 0 ? `${filteredSelectors.join(", ")}, ${builtInCleanup}` : builtInCleanup;
        style.textContent = `${combined}:not(#zg-zapper-highlight):not(#zg-inspector-highlight) { display: none !important; }`;
        this.runBuiltInAdSlotCleanup();

        if (scope === "custom") {
            filteredSelectors.forEach((selector) => this.aggressiveRules.add(selector));
            this.startAggressiveObserver();
            this.enforceAggressiveFiltering();
        }
    }

    previewElement(selector: string | null, enabled: boolean): void {
        if (!selector || !enabled) {
            document.getElementById("zenithguard-preview-style")?.remove();
            return;
        }

        let style = document.getElementById("zenithguard-preview-style") as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = "zenithguard-preview-style";
            (document.head || document.documentElement).appendChild(style);
        }

        style.textContent = `${selector} { outline: 2px solid #3b82f6 !important; outline-offset: 2px !important; }`;
    }

    executeAdblockWallFix(selectors: WallFixSelectors): WallFixApplyResult {
        const result = this.applyWallFix(selectors);
        this.showToast({ message: "Temporary wall-fix applied. Reopen the popup to save or discard it.", type: "success", duration: 6000 });
        return result;
    }

    applyWallFix(selectors: WallFixSelectors): WallFixApplyResult {
        this.activeWallFix = selectors;
        selectors.overlaySelector.split(",").forEach((selector) => this.aggressiveRules.add(selector.trim()));
        this.unlockScroll(selectors.scrollSelector || "body");
        this.unlockScroll("html");
        let contentUnlockMatchCount = 0;
        if (selectors.contentUnlockSelector) {
            contentUnlockMatchCount = this.unlockContentContainers(selectors.contentUnlockSelector);
        }
        const heuristicOverlayMatchCount = this.removeLikelyInteractionBlockers(selectors.contentUnlockSelector);
        this.startAggressiveObserver();
        this.enforceAggressiveFiltering();
        const overlayMatchCount = selectors.overlaySelector
            .split(",")
            .map((selector) => selector.trim())
            .filter(Boolean)
            .reduce((total, selector) => total + this.findEverywhere(selector).length, 0) + heuristicOverlayMatchCount;

        return {
            overlayMatchCount,
            contentUnlockMatchCount,
        };
    }

    applyIframeSandboxing(): void {
        const currentHostname = window.location.hostname;
        for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
            try {
                if (!iframe.src) {
                    continue;
                }
                const iframeHostname = new URL(iframe.src, window.location.href).hostname;
                if (
                    iframeHostname !== currentHostname
                    && !isGoogleIdentityHostname(iframeHostname)
                    && !iframe.hasAttribute("sandbox")
                ) {
                    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups allow-forms");
                }
            } catch {
                // Ignore malformed iframe src values.
            }
        }
    }

    async saveHidingRule(selector: string, activity?: HidingRuleActivity): Promise<void> {
        try {
            const hostname = window.location.hostname;
            const snapshot = await getSync<{ customHidingRules?: Record<string, HidingRule[]> }>(["customHidingRules"]);
            const customHidingRules = snapshot.customHidingRules || {};
            const bucketKey = findMatchingRuleBucketKey(hostname, customHidingRules) || hostname;
            customHidingRules[bucketKey] = customHidingRules[bucketKey] || [];
            const existingRule = customHidingRules[bucketKey].find((rule) => rule.value === selector);
            if (existingRule && existingRule.enabled !== false) {
                this.showToast({ message: "This hiding rule already exists." });
                return;
            }

            if (existingRule) {
                existingRule.enabled = true;
            } else {
                customHidingRules[bucketKey].push({ value: selector, enabled: true });
            }
            await setSync({ customHidingRules: normalizeCustomHidingRuleBuckets(customHidingRules) });
            if (activity) {
                await this.appendToolActivity(hostname, activity);
            }
            this.showToast({ message: "Hiding rule saved!" });
        } catch {
            this.showToast({ message: "Failed to save rule.", type: "error" });
        }
    }

    stop(scope?: string): void {
        if (scope) {
            const style = document.getElementById(`zenithguard-styles-${scope}`) as HTMLStyleElement | null;
            if (style) {
                style.textContent = "";
            }
        } else {
            for (const id of [
                "zenithguard-styles-custom",
                "zenithguard-styles-filterList",
                "zenithguard-styles-default",
                "zenithguard-preview-style",
                "zenithguard-aggressive-styles",
            ]) {
                document.getElementById(id)?.remove();
            }
        }

        if (!scope || scope === "custom") {
            this.stopAggressiveFiltering();
        }

        if (!scope) {
            this.builtInCleanupObserver?.disconnect();
            this.builtInCleanupObserver = null;
            this.builtInCleanupObservedRoots = new WeakSet<Node>();
            if (this.builtInCleanupTimeout) {
                window.clearTimeout(this.builtInCleanupTimeout);
                this.builtInCleanupTimeout = null;
            }
            if (this.builtInCleanupActivityTimeout) {
                window.clearTimeout(this.builtInCleanupActivityTimeout);
                this.builtInCleanupActivityTimeout = null;
            }
            this.pendingBuiltInCleanupActivityCount = 0;
            this.pendingBuiltInCleanupHints.clear();
        }
    }

    private stopAggressiveFiltering(): void {
        this.aggressiveRules.clear();
        this.activeWallFix = null;
        this.wallFixObserver?.disconnect();
        this.wallFixObserver = null;
        if (this.observerTimeout) {
            window.clearTimeout(this.observerTimeout);
            this.observerTimeout = null;
        }
    }

    private runBuiltInAdSlotCleanup(): void {
        const result = this.collapseBuiltInAdPlaceholders();
        this.queueBuiltInCleanupActivity(result);
        this.startBuiltInCleanupObserver();
        this.observeBuiltInShadowRoots();
    }

    private startBuiltInCleanupObserver(): void {
        if (this.builtInCleanupObserver) {
            this.observeBuiltInCleanupRoot(document.documentElement || document.body);
            return;
        }

        this.builtInCleanupObserver = new MutationObserver((mutations) => {
            if (this.mutationsMayNeedBuiltInCleanup(mutations)) {
                this.scheduleBuiltInCleanup();
            }
        });

        this.observeBuiltInCleanupRoot(document.documentElement || document.body);
    }

    private observeBuiltInCleanupRoot(root: Node | null | undefined): void {
        if (!this.builtInCleanupObserver || !(root instanceof Node) || this.builtInCleanupObservedRoots.has(root)) {
            return;
        }

        this.builtInCleanupObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-ad-status", "data-ad-client", "data-ad-slot", "data-ad-unit", "data-ad-unit-path", "data-text-ad", "data-pla"],
        });
        this.builtInCleanupObservedRoots.add(root);
    }

    private observeBuiltInShadowRoots(root: Document | ShadowRoot = document): void {
        for (const host of Array.from(root.querySelectorAll("*"))) {
            const shadowRoot = (host as HTMLElement).shadowRoot;
            if (!shadowRoot) {
                continue;
            }
            this.observeBuiltInCleanupRoot(shadowRoot);
            this.observeBuiltInShadowRoots(shadowRoot);
        }
    }

    private scheduleBuiltInCleanup(): void {
        if (this.builtInCleanupTimeout) {
            window.clearTimeout(this.builtInCleanupTimeout);
        }
        this.builtInCleanupTimeout = window.setTimeout(() => {
            const result = this.collapseBuiltInAdPlaceholders();
            this.queueBuiltInCleanupActivity(result);
            this.observeBuiltInShadowRoots();
        }, 150);
    }

    private mutationsMayNeedBuiltInCleanup(mutations: MutationRecord[]): boolean {
        if (this.isGoogleSearchResultsPage() && mutations.some((mutation) => mutation.type === "childList"
            && Array.from(mutation.addedNodes).some((node) => node instanceof HTMLElement))) {
            return true;
        }

        return mutations.some((mutation) => {
            if (mutation.type === "attributes") {
                return mutation.target instanceof HTMLElement
                    && this.elementMayNeedBuiltInCleanup(mutation.target);
            }

            if (mutation.type !== "childList") {
                return false;
            }

            return Array.from(mutation.addedNodes).some((node) => this.nodeMayNeedBuiltInCleanup(node));
        });
    }

    private nodeMayNeedBuiltInCleanup(node: Node): boolean {
        if (!(node instanceof HTMLElement)) {
            return false;
        }

        if (this.elementMayNeedBuiltInCleanup(node)) {
            return true;
        }

        const candidates = Array.from(node.querySelectorAll("[id], [class], iframe, ins, [data-ad-client], [data-ad-slot], [data-ad-unit], [data-ad-unit-path], [data-text-ad], [data-pla]"))
            .slice(0, 80);
        return candidates.some((candidate) => candidate instanceof HTMLElement && this.elementMayNeedBuiltInCleanup(candidate));
    }

    private elementMayNeedBuiltInCleanup(element: HTMLElement): boolean {
        const marker = [
            element.tagName,
            element.id,
            typeof element.className === "string" ? element.className : "",
            element.getAttribute("name"),
            element.getAttribute("src"),
            element.getAttribute("data-ad-status"),
            element.getAttribute("data-ad-client"),
            element.getAttribute("data-ad-slot"),
            element.getAttribute("data-ad-unit"),
            element.getAttribute("data-ad-unit-path"),
            element.getAttribute("data-text-ad"),
            element.getAttribute("data-pla"),
        ].filter(Boolean).join(" ").toLowerCase();

        return BUILT_IN_CLEANUP_MUTATION_HINTS.some((hint) => marker.includes(hint));
    }

    private startAggressiveObserver(): void {
        if (this.wallFixObserver) {
            return;
        }

        const observeRoot = document.documentElement || document.body;
        if (!(observeRoot instanceof Node)) {
            return;
        }

        this.wallFixObserver = new MutationObserver(() => {
            if (this.observerTimeout) {
                window.clearTimeout(this.observerTimeout);
            }
            this.observerTimeout = window.setTimeout(() => this.enforceAggressiveFiltering(), 100);
        });

        this.wallFixObserver.observe(observeRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class", "id"],
        });
    }

    private enforceAggressiveFiltering(): void {
        this.ensureAggressiveStyleTag();
        const result = this.collapseBuiltInAdPlaceholders();
        this.queueBuiltInCleanupActivity(result);
        for (const selector of this.aggressiveRules) {
            for (const node of this.findEverywhere(selector)) {
                try {
                    (node as HTMLElement).remove();
                } catch {
                    (node as HTMLElement).style.setProperty("display", "none", "important");
                }
            }
        }
        this.unlockScroll("body");
        this.unlockScroll("html");
        if (this.activeWallFix?.contentUnlockSelector) {
            this.unlockContentContainers(this.activeWallFix.contentUnlockSelector);
            this.removeLikelyInteractionBlockers(this.activeWallFix.contentUnlockSelector);
        }
    }

    private ensureAggressiveStyleTag(): void {
        const styleId = "zenithguard-aggressive-styles";
        let style = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = Array.from(this.aggressiveRules)
            .map((selector) => `${selector} { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; z-index: -2147483647 !important; width: 0 !important; height: 0 !important; position: fixed !important; top: -10000px !important; max-height: 0 !important; overflow: hidden !important; }`)
            .join("\n");
    }

    private findEverywhere(selector: string, root: Document | ShadowRoot = document): Element[] {
        if (!selector || !selector.trim()) {
            return [];
        }

        let matches: Element[] = [];
        try {
            matches = Array.from(root.querySelectorAll(selector));
        } catch {
            return [];
        }

        for (const host of Array.from(root.querySelectorAll("*"))) {
            if ((host as HTMLElement).shadowRoot) {
                matches = matches.concat(this.findEverywhere(selector, (host as HTMLElement).shadowRoot as ShadowRoot));
            }
        }

        return matches;
    }

    private unlockScroll(selector: string): void {
        for (const node of this.findEverywhere(selector)) {
            const element = node as HTMLElement;
            element.style.setProperty("overflow", "visible", "important");
            element.style.setProperty("overflow-y", "visible", "important");
            element.style.setProperty("position", "static", "important");
            element.style.setProperty("pointer-events", "auto", "important");
        }
    }

    private unlockContentContainers(selector: string): number {
        const matches = this.findEverywhere(selector);
        for (const node of matches) {
            const element = node as HTMLElement;
            element.style.setProperty("max-height", "none", "important");
            element.style.setProperty("height", "auto", "important");
            element.style.setProperty("overflow", "visible", "important");
            element.style.setProperty("clip-path", "none", "important");
            element.style.setProperty("filter", "none", "important");
            element.style.setProperty("opacity", "1", "important");
            element.style.setProperty("visibility", "visible", "important");
            element.style.setProperty("pointer-events", "auto", "important");
            element.style.setProperty("transform", "none", "important");
            element.style.removeProperty("mask-image");
            element.style.removeProperty("-webkit-mask-image");
        }
        return matches.length;
    }

    private removeLikelyInteractionBlockers(contentSelector?: string): number {
        if (!contentSelector || typeof document.elementsFromPoint !== "function") {
            return 0;
        }

        const contentMatches = this.findEverywhere(contentSelector)
            .filter((node): node is HTMLElement => node instanceof HTMLElement);
        if (contentMatches.length === 0) {
            return 0;
        }

        const hidden = new Set<HTMLElement>();
        for (const contentElement of contentMatches.slice(0, 3)) {
            const rect = contentElement.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 40) {
                continue;
            }

            const x = Math.min(window.innerWidth - 2, Math.max(2, rect.left + Math.min(rect.width * 0.5, rect.width - 2)));
            const y = Math.min(window.innerHeight - 2, Math.max(2, rect.top + Math.min(rect.height * 0.2, rect.height - 2)));
            const stack = document.elementsFromPoint(x, y);

            for (const node of stack) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }
                if (node === contentElement || contentElement.contains(node)) {
                    break;
                }
                if (!this.isLikelyInteractionBlocker(node)) {
                    continue;
                }

                this.hideElement(node);
                node.style.setProperty("pointer-events", "none", "important");
                hidden.add(node);
            }
        }

        return hidden.size;
    }

    private isLikelyInteractionBlocker(element: HTMLElement): boolean {
        const text = `${element.id || ""} ${element.className || ""} ${element.getAttribute("role") || ""}`.toLowerCase();
        if (!text) {
            return false;
        }
        if (text.includes("zenithguard") || text.includes("zg-")) {
            return false;
        }

        const computed = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const zIndex = Number.parseInt(computed.zIndex || "0", 10);
        const likelyKeyword = [
            "paywall",
            "modal",
            "drawer",
            "overlay",
            "scrim",
            "backdrop",
            "subscribe",
            "signin",
            "sign-in",
            "login",
            "wall",
            "radix",
        ].some((keyword) => text.includes(keyword));

        const coversSubstantialArea = rect.width >= window.innerWidth * 0.35 && rect.height >= 40;
        const positionedAboveContent = computed.position === "fixed" || computed.position === "sticky" || computed.position === "absolute";
        const interceptsPointer = computed.pointerEvents !== "none";
        const visuallySubtle = Number.parseFloat(computed.opacity || "1") < 0.35
            || computed.backgroundColor.includes("rgba(")
            || computed.backdropFilter !== "none";

        return likelyKeyword
            && coversSubstantialArea
            && positionedAboveContent
            && interceptsPointer
            && (visuallySubtle || (Number.isFinite(zIndex) && zIndex >= 10));
    }

    private collapseBuiltInAdPlaceholders(): CleanupCollapseResult {
        const result: CleanupCollapseResult = { count: 0, hints: [] };
        for (const node of this.findEverywhere(BUILT_IN_AD_SLOT_CLEANUP_SELECTORS.join(", "))) {
            this.mergeCleanupResult(result, this.collapseElementAndContainers(node as HTMLElement));
        }
        this.mergeCleanupResult(result, this.collapseGoogleSearchSponsoredResults());
        this.mergeCleanupResult(result, this.collapseEmptyAdContainers());
        return result;
    }

    private collapseGoogleSearchSponsoredResults(): CleanupCollapseResult {
        const result: CleanupCollapseResult = { count: 0, hints: [] };
        if (!this.isGoogleSearchResultsPage()) {
            return result;
        }

        const explicitAdSelectors = [
            "#tads [data-text-ad]",
            "#tadsb [data-text-ad]",
            "#bottomads [data-text-ad]",
            "#rhs [data-text-ad]",
            "#tads [data-pla]",
            "#tadsb [data-pla]",
            "#bottomads [data-pla]",
            "#rhs [data-pla]",
        ];
        for (const node of this.findEverywhere(explicitAdSelectors.join(", "))) {
            if (node instanceof HTMLElement) {
                this.recordHiddenElement(result, node);
            }
        }

        for (const region of this.findEverywhere("#tads, #tadsb, #bottomads, #rhs")) {
            if (!(region instanceof HTMLElement)) {
                continue;
            }

            for (const candidate of this.findGoogleSearchSponsoredContainers(region)) {
                this.recordHiddenElement(result, candidate);
            }
        }

        return result;
    }

    private isGoogleSearchResultsPage(): boolean {
        const location = this.getCurrentLocation();
        const hostname = location.hostname.toLowerCase();
        const pathname = location.pathname.toLowerCase();
        return /^www\.google\.[a-z.]+$/.test(hostname)
            && (pathname === "/search" || location.search.includes("q="));
    }

    private getCurrentLocation(): Location | URL {
        return window.location;
    }

    private findGoogleSearchSponsoredContainers(region: HTMLElement): HTMLElement[] {
        const containers = new Set<HTMLElement>();
        const labelCandidates = Array.from(region.querySelectorAll("span, div, [aria-label]"))
            .filter((node): node is HTMLElement => node instanceof HTMLElement);

        for (const label of labelCandidates) {
            if (!this.isGoogleSearchSponsoredLabel(label)) {
                continue;
            }

            const container = label.closest("[data-text-ad], [data-pla], .uEierd, [data-ved], [jscontroller]") as HTMLElement | null;
            if (container && region.contains(container) && this.googleSearchAdContainerHasResultLink(container)) {
                containers.add(container);
                continue;
            }

            const directChild = this.findRegionChildContaining(region, label);
            if (directChild && this.googleSearchAdContainerHasResultLink(directChild)) {
                containers.add(directChild);
            }
        }

        return Array.from(containers);
    }

    private isGoogleSearchSponsoredLabel(element: HTMLElement): boolean {
        const normalizedText = (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        const normalizedLabel = (element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().toLowerCase();
        return normalizedText === "sponsored"
            || normalizedText === "ad"
            || normalizedText === "ads"
            || normalizedLabel === "sponsored"
            || normalizedLabel === "ad"
            || normalizedLabel === "ads";
    }

    private googleSearchAdContainerHasResultLink(element: HTMLElement): boolean {
        return Array.from(element.querySelectorAll("a[href]"))
            .some((link) => link instanceof HTMLAnchorElement && Boolean(link.href));
    }

    private findRegionChildContaining(region: HTMLElement, element: HTMLElement): HTMLElement | null {
        let current: HTMLElement | null = element;
        while (current?.parentElement && current.parentElement !== region) {
            current = current.parentElement;
        }
        return current?.parentElement === region ? current : null;
    }

    private collapseEmptyAdContainers(): CleanupCollapseResult {
        const result: CleanupCollapseResult = { count: 0, hints: [] };
        for (const node of this.findEverywhere(BUILT_IN_AD_CONTAINER_CLEANUP_SELECTORS.join(", "))) {
            if (node instanceof HTMLElement && this.isAdOnlyContainer(node)) {
                this.mergeCleanupResult(result, this.collapseElementAndContainers(node));
            }
        }
        return result;
    }

    private collapseElementAndContainers(element: HTMLElement): CleanupCollapseResult {
        const result: CleanupCollapseResult = { count: 0, hints: [] };
        this.recordHiddenElement(result, element);
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 3 && (this.looksLikeAdContainer(parent) || this.isAdOnlyContainer(parent))) {
            this.recordHiddenElement(result, parent);
            parent = parent.parentElement;
            depth += 1;
        }
        return result;
    }

    private hideElement(element: HTMLElement): boolean {
        const wasAlreadyCleaned = element.dataset.zgCosmeticCleaned === "1";
        element.dataset.zgCosmeticCleaned = "1";
        element.style.setProperty("display", "none", "important");
        element.style.setProperty("visibility", "hidden", "important");
        element.style.setProperty("height", "0", "important");
        element.style.setProperty("min-height", "0", "important");
        element.style.setProperty("max-height", "0", "important");
        element.style.setProperty("margin", "0", "important");
        element.style.setProperty("padding", "0", "important");
        element.style.setProperty("overflow", "hidden", "important");
        return !wasAlreadyCleaned;
    }

    private queueBuiltInCleanupActivity(result: CleanupCollapseResult): void {
        if (result.count <= 0) {
            return;
        }

        this.pendingBuiltInCleanupActivityCount += result.count;
        result.hints.forEach((hint) => this.pendingBuiltInCleanupHints.add(hint));
        if (this.builtInCleanupActivityTimeout) {
            return;
        }

        const elapsed = Date.now() - this.lastBuiltInCleanupActivityAt;
        const delay = this.lastBuiltInCleanupActivityAt > 0
            ? Math.max(750, 10000 - elapsed)
            : 750;
        this.builtInCleanupActivityTimeout = window.setTimeout(() => {
            this.builtInCleanupActivityTimeout = null;
            const total = this.pendingBuiltInCleanupActivityCount;
            this.pendingBuiltInCleanupActivityCount = 0;
            if (total <= 0) {
                return;
            }

            this.lastBuiltInCleanupActivityAt = Date.now();
            const hints = Array.from(this.pendingBuiltInCleanupHints).slice(0, 3);
            this.pendingBuiltInCleanupHints.clear();
            const plural = total === 1 ? "" : "s";
            const summary: CosmeticCleanupSummary = {
                count: total,
                latestHint: hints[0],
                updatedAt: this.lastBuiltInCleanupActivityAt,
                pageUrl: window.location.href,
            };
            void Promise.all([
                this.appendToolActivity(window.location.hostname, {
                    tool: "Cosmetic Cleanup",
                    title: "Ad Shells Cleaned",
                    message: `Collapsed ${total} leftover ad shell${plural} after blocking.`,
                    tone: "success",
                }),
                this.persistCosmeticCleanupSummary(window.location.hostname, summary),
            ]).catch((error) => {
                console.warn("ZenithGuard: Failed to persist cosmetic cleanup activity.", error);
            });
        }, delay);
    }

    private mergeCleanupResult(target: CleanupCollapseResult, incoming: CleanupCollapseResult): void {
        target.count += incoming.count;
        target.hints.push(...incoming.hints);
    }

    private recordHiddenElement(result: CleanupCollapseResult, element: HTMLElement): void {
        if (this.hideElement(element)) {
            result.count += 1;
            result.hints.push(this.describeElement(element));
        }
    }

    private describeElement(element: HTMLElement): string {
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : "";
        const className = typeof element.className === "string"
            ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((value) => `.${value}`).join("")
            : "";
        const src = element instanceof HTMLIFrameElement && element.src
            ? ` ${this.describeUrlHost(element.src)}`
            : "";
        const marker = [
            element.getAttribute("data-ad-slot"),
            element.getAttribute("data-ad-unit"),
            element.getAttribute("data-ad-unit-path"),
        ].find(Boolean);

        return `${tag}${id}${className}${marker ? ` [${marker}]` : ""}${src}`.slice(0, 160);
    }

    private describeUrlHost(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return url.slice(0, 80);
        }
    }

    private looksLikeAdContainer(element: HTMLElement): boolean {
        const text = `${element.id || ""} ${element.className || ""}`.toLowerCase();
        return BUILT_IN_AD_CONTAINER_HINTS.some((hint) => text.includes(hint))
            || element.hasAttribute("data-ad-client")
            || element.hasAttribute("data-ad-slot")
            || element.hasAttribute("data-ad-unit")
            || element.hasAttribute("data-ad-unit-path");
    }

    private isAdOnlyContainer(element: HTMLElement): boolean {
        if (this.hasMeaningfulNonAdText(element)) {
            return false;
        }

        const children = Array.from(element.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement)
            .filter((child) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(child.tagName));

        if (children.length === 0) {
            return this.looksLikeAdContainer(element);
        }

        return children.every((child) => this.isKnownAdFrame(child)
            || this.looksLikeAdContainer(child)
            || this.isEffectivelyHidden(child));
    }

    private hasMeaningfulNonAdText(element: HTMLElement): boolean {
        const normalized = (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!normalized) {
            return false;
        }

        return !AD_ONLY_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
    }

    private isKnownAdFrame(element: HTMLElement): boolean {
        if (element.tagName !== "IFRAME") {
            return false;
        }

        const marker = [
            element.id,
            element.getAttribute("name"),
            element.getAttribute("src"),
        ].join(" ").toLowerCase();

        return [
            "google_ads_iframe",
            "doubleclick.net",
            "googlesyndication.com",
            "googletagservices.com",
            "googleads.",
            "gampad",
            "aswift",
        ].some((pattern) => marker.includes(pattern));
    }

    private isEffectivelyHidden(element: HTMLElement): boolean {
        return element.style.display === "none"
            || element.style.visibility === "hidden"
            || element.style.height === "0px"
            || element.style.height === "0";
    }
}
