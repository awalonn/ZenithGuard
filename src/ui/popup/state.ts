import { getTopMatchedSources, getTopRuleFamilies, getRuleFamilyLabel, type LogEntry } from "../../js/background/modules/network_logger/network_log_analytics";
import { hostnamesMatch } from "../../js/shared/hostname_matching";
import type {
    PopupNetworkLog,
    PopupSnapshot,
    SitePolicyState,
    CosmeticCleanupSummary,
    TemporaryWallFix,
    ToolActivityEntry,
    ToolStatusCard,
    WallFixDetailItem,
} from "./types";

function formatTime(timestamp: number): string {
    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(timestamp));
    } catch {
        return new Date(timestamp).toLocaleTimeString();
    }
}

export function formatFocusModeUntil(until: number | undefined): string {
    if (!until || until <= Date.now()) {
        return "";
    }

    return formatTime(until);
}

export function buildSitePolicyState(snapshot: PopupSnapshot): SitePolicyState {
    const isSiteProtectionEnabled = !snapshot.isExtensionPage
        && !snapshot.settings.disabledSites.some((value) => hostnamesMatch(snapshot.hostname, value));
    const isIsolationModeEnabled = !snapshot.isExtensionPage
        && snapshot.settings.isolationModeSites.some((rule) => rule.enabled !== false && hostnamesMatch(snapshot.hostname, rule.value));
    const isForgetfulBrowsingEnabled = !snapshot.isExtensionPage
        && snapshot.settings.forgetfulSites.some((rule) => rule.enabled !== false && hostnamesMatch(snapshot.hostname, rule.value));
    const hasCustomHidingRules = snapshot.hiddenRules.some((rule) => rule.enabled !== false);
    const hasTemporaryWallFix = Boolean(snapshot.temporaryWallFix);
    const hasPartialTemporaryWallFix = Boolean(snapshot.temporaryWallFix && !snapshot.temporaryWallFix.contentUnlockSelector?.trim());
    const activeSiteModes = [
        isIsolationModeEnabled,
        isForgetfulBrowsingEnabled,
        hasCustomHidingRules,
        snapshot.hasSavedWallFix,
        !isSiteProtectionEnabled,
    ].filter(Boolean).length;

    return {
        hostname: snapshot.hostname,
        isExtensionPage: snapshot.isExtensionPage,
        isProtectionEnabled: snapshot.settings.isProtectionEnabled,
        isSiteProtectionEnabled,
        isPausedByTimer: Boolean(snapshot.storage.protectionPausedUntil && snapshot.storage.protectionPausedUntil > Date.now()),
        isIsolationModeEnabled,
        isForgetfulBrowsingEnabled,
        hasCustomHidingRules,
        hasSavedWallFix: snapshot.hasSavedWallFix,
        hasTemporaryWallFix,
        hasPartialTemporaryWallFix,
        hiddenRuleCount: snapshot.hiddenRules.filter((rule) => rule.enabled !== false).length,
        activeSiteModes,
        focusModeActive: Boolean(snapshot.settings.isFocusModeEnabled && snapshot.settings.focusModeUntil > Date.now()),
        focusModeUntilText: formatFocusModeUntil(snapshot.settings.focusModeUntil),
    };
}

export function getProtectionLabel(policy: SitePolicyState): string {
    if (!policy.isProtectionEnabled) {
        return "Protection off";
    }
    if (!policy.isSiteProtectionEnabled) {
        return "Paused on this site";
    }
    if (policy.isExtensionPage) {
        return "Extension view";
    }
    return "Protecting this site";
}

export function getHeroToggleLabel(policy: SitePolicyState): string {
    return policy.isExtensionPage ? "Protection" : "Site Protection";
}

export function getHeroToggleChecked(policy: SitePolicyState): boolean {
    return policy.isExtensionPage ? policy.isProtectionEnabled : policy.isSiteProtectionEnabled;
}

export function getAiScanLabel(snapshot: PopupSnapshot): string {
    return snapshot.hasRecentAiScan
        ? "A recent AI scan is cached for this page."
        : "No recent AI scan is cached for this page yet.";
}

export function getFocusModeLabel(policy: SitePolicyState): string {
    return policy.focusModeActive
        ? `Focus Mode session active${policy.focusModeUntilText ? ` until ${policy.focusModeUntilText}` : ""}.`
        : "No Focus Mode session is active right now.";
}

export function getWallFixLabel(policy: SitePolicyState): string {
    if (policy.hasPartialTemporaryWallFix) {
        return "An experimental partial wall fix is active. Inspector is still the safer next step.";
    }

    if (policy.hasTemporaryWallFix) {
        return "A temporary wall fix is active. Save it only if the page genuinely looks correct.";
    }

    if (policy.hasSavedWallFix) {
        return "A saved wall fix exists for this site.";
    }

    return "No saved or temporary wall fix is active on this site.";
}

export function getSitePolicySummary(policy: SitePolicyState): string {
    if (!policy.isProtectionEnabled) {
        return "Global protection is currently disabled.";
    }
    if (!policy.isSiteProtectionEnabled) {
        return "This site is paused and bypassing normal blocking.";
    }
    if (policy.hasTemporaryWallFix) {
        return policy.hasPartialTemporaryWallFix
            ? "A temporary partial wall-fix is active. It hid something, but content may still be locked."
            : "A temporary wall-fix is active for this site. Save it only if the page actually looks right.";
    }
    if (policy.activeSiteModes === 0) {
        return "Baseline protection is active. No extra site policy is applied here.";
    }

    return `${policy.activeSiteModes} site-specific protection mode${policy.activeSiteModes > 1 ? "s are" : " is"} active here.`;
}

export function getProtectionSnapshotSummary(snapshot: PopupSnapshot): string {
    const blockedCount = snapshot.networkLog.filter((entry) => entry.status === "blocked").length;
    const cleanedCount = snapshot.networkLog.filter((entry) => entry.status === "modified").length;

    if (blockedCount + cleanedCount === 0) {
        return "Quiet page so far.";
    }
    if (blockedCount > cleanedCount) {
        return "Blocking is doing most of the work on this page.";
    }
    if (cleanedCount > 0) {
        return "Cleanup and URL hygiene are active on this page.";
    }
    return "Protection is active on this page.";
}

export function getRecentCosmeticCleanupActivity(entries: ToolActivityEntry[]): ToolActivityEntry | null {
    return entries
        .filter((entry) => entry.tool === "Cosmetic Cleanup")
        .sort((left, right) => right.timestamp - left.timestamp)[0] || null;
}

export function getCosmeticCleanupSummary(snapshot: PopupSnapshot): CosmeticCleanupSummary | null {
    const entries = snapshot.storage.cosmeticCleanupSummaryByHostname || {};
    for (const [hostname, summary] of Object.entries(entries)) {
        if (hostnamesMatch(hostname, snapshot.hostname)) {
            return summary;
        }
    }

    return null;
}

export function buildWallFixDetails(wallFix: TemporaryWallFix | null): WallFixDetailItem[] {
    if (!wallFix) {
        return [];
    }

    return [
        { label: "Overlay", value: wallFix.overlaySelector },
        { label: "Scroll unlock", value: wallFix.scrollSelector || "body, html" },
        { label: "Content unlock", value: wallFix.contentUnlockSelector || "None returned" },
        { label: "AI reasoning", value: wallFix.reasoning || "No reasoning returned" },
    ];
}

export function getBestNextMove(policy: SitePolicyState): ToolStatusCard {
    if (policy.hasPartialTemporaryWallFix) {
        return {
            title: "Best next move: Inspector",
            message: "The wall fix only removed part of the blocker. Use Inspector to target the remaining paywall or locked content container.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        };
    }

    if (policy.hasTemporaryWallFix) {
        return {
            title: "Best next move: Inspector review",
            message: "This site has a temporary wall fix. Verify it carefully, then either save it or switch to Inspector for manual cleanup.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        };
    }

    if (policy.hiddenRuleCount > 0) {
        return {
            title: "Best next move: Inspector",
            message: "This site already has hidden-element rules. Inspector is the safest follow-up if something else still needs cleanup.",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector",
        };
    }

    return {
        title: "Best next move: start simple",
        message: "Use Zapper for one obvious element, Inspector for precise manual control, and Fix Cookies for consent banners. Treat Defeat Wall as an experimental fallback only.",
        tone: "info",
        actionLabel: "Use Inspector",
        action: "open-inspector",
    };
}

export function getBlockerMix(entries: PopupNetworkLog[], limit = 3): string[] {
    return getTopRuleFamilies(entries as LogEntry[], limit)
        .map(([family, count]) => `${getRuleFamilyLabel(family)}: ${count}`);
}

export function getTopSources(entries: PopupNetworkLog[], limit = 4): string[] {
    return getTopMatchedSources(entries as LogEntry[], limit)
        .map(([source, count]) => `${source}: ${count}`);
}

export function getRecentNotableActivity(entries: PopupNetworkLog[], limit = 5): PopupNetworkLog[] {
    return entries
        .filter((entry) => entry.status !== "allowed")
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, limit);
}

export function getMatchedValue(entry: PopupNetworkLog): string {
    return entry.matchedRuleInfo?.matchedValue || entry.matchedRuleInfo?.detail || "";
}

export function getLogSourceLabel(entry: PopupNetworkLog): string {
    return entry.matchedRuleInfo?.source || entry.type || "Unknown";
}

export function getLogStatusLabel(entry: PopupNetworkLog): string {
    return entry.status === "modified" ? "modified" : "blocked";
}

export function getHostnameFromLogUrl(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}
