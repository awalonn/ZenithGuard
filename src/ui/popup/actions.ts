import { openAnalyzerPage, openLoggerPage, openOptionsPage } from "../../js/shared/browser";
import { findMatchingStringIndex, hostnamesMatch } from "../../js/shared/hostname_matching";
import { normalizeCustomHidingRuleBuckets, normalizePersistentWallFixMap, normalizeTemporaryWallFixMap } from "../../js/shared/site_bucket_maps";
import { sendContentMessage, sendMessage, type CookieConsentResponse, type DefeatAdblockWallResponse } from "../../js/shared/runtime_messages";
import { getLocal, getSync, removeLocal, removeSync, setLocal, setSync } from "../../js/shared/storage_api";
import { buildReviewCandidateList, buildSiteReportPackage } from "./site_report";
import { mapAiToolError, mapToolLaunchError } from "./tool_activity";
import type { PageToolActionType, PopupSnapshot, SitePolicyState, TemporaryWallFix, ToolActivityEntry, ToolStatusCard } from "./types";

function findMatchingRecordKey<T>(entries: Record<string, T> | undefined, hostname: string): string | null {
    if (!entries || typeof entries !== "object") {
        return null;
    }

    for (const key of Object.keys(entries)) {
        if (hostnamesMatch(key, hostname)) {
            return key;
        }
    }

    return null;
}

function normalizeActivityHostname(hostname: string): string {
    const normalized = String(hostname || "").trim().toLowerCase();
    return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

function findMatchingHostnameIndex(entries: string[], hostname: string): number {
    return findMatchingStringIndex(entries, hostname);
}

function findMatchingToggleableRule(
    rules: Array<{ value: string; enabled: boolean }>,
    hostname: string,
): { value: string; enabled: boolean } | undefined {
    return rules.find((rule) => hostnamesMatch(rule?.value, hostname));
}

function closePopupSoon(): void {
    if (typeof window === "undefined" || typeof window.close !== "function") {
        return;
    }

    window.setTimeout(() => {
        window.close();
    }, 40);
}

type TabUpdateInfo = {
    status?: string;
};

async function waitForTabComplete(tabId: number, timeoutMs = 6000): Promise<void> {
    if (
        typeof chrome === "undefined"
        || !chrome.tabs?.onUpdated
        || !chrome.tabs?.onRemoved
    ) {
        return;
    }

    await new Promise<void>((resolve) => {
        let settled = false;

        const finish = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            chrome.tabs.onUpdated.removeListener(handleUpdated);
            chrome.tabs.onRemoved.removeListener(handleRemoved);
            clearTimeout(timeoutId);
            resolve();
        };

        const handleUpdated = (
            updatedTabId: number,
            changeInfo: TabUpdateInfo,
        ): void => {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                finish();
            }
        };

        const handleRemoved = (removedTabId: number): void => {
            if (removedTabId === tabId) {
                finish();
            }
        };

        const timeoutId = window.setTimeout(finish, timeoutMs);

        chrome.tabs.onUpdated.addListener(handleUpdated);
        chrome.tabs.onRemoved.addListener(handleRemoved);
    });
}

async function reloadTab(tabId?: number | null): Promise<void> {
    if (typeof tabId !== "number") {
        return;
    }

    try {
        const completion = waitForTabComplete(tabId);
        await chrome.tabs.reload(tabId);
        await completion;
    } catch {
        // Ignore reload failures for closed or protected tabs.
    }
}

async function appendToolActivity(
    tool: string,
    hostname: string,
    card: ToolStatusCard,
): Promise<void> {
    const snapshot = await getLocal<{ toolActivityLog?: ToolActivityEntry[] }>("toolActivityLog");
    const current = snapshot && Array.isArray(snapshot.toolActivityLog) ? snapshot.toolActivityLog : [];
    const entry: ToolActivityEntry = {
        tool,
        title: card.title,
        message: card.message,
        tone: card.tone,
        timestamp: Date.now(),
        domain: normalizeActivityHostname(hostname),
    };

    await setLocal({
        toolActivityLog: [entry, ...current].slice(0, 25),
    });
}

async function appendToolActivitySafely(
    tool: string,
    hostname: string,
    card: ToolStatusCard,
): Promise<void> {
    try {
        await appendToolActivity(tool, hostname, card);
    } catch (error) {
        console.warn("ZenithGuard: Failed to persist popup tool activity.", error);
    }
}

async function copyTextToClipboard(text: string): Promise<void> {
    try {
        if (!navigator.clipboard?.writeText) {
            throw new Error("Clipboard API unavailable.");
        }

        await navigator.clipboard.writeText(text);
    } catch (clipboardError) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        try {
            if (!document.execCommand("copy")) {
                throw clipboardError;
            }
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

export async function toggleGlobalProtection(currentValue: boolean): Promise<boolean> {
    const nextValue = !currentValue;
    await setSync({ isProtectionEnabled: nextValue });

    if (nextValue) {
        await removeLocal("protectionPausedUntil");
    }

    await sendMessage({ type: "APPLY_ALL_RULES" });
    return nextValue;
}

async function applyRulesForCurrentTab(tabId?: number | null): Promise<void> {
    if (typeof tabId === "number") {
        const completion = waitForTabComplete(tabId);
        await sendMessage({ type: "APPLY_RULES_AND_RELOAD_TAB", data: { tabId } });
        await completion;
        return;
    }

    await sendMessage({ type: "APPLY_ALL_RULES" });
}

export async function toggleSitePause(hostname: string, tabId?: number | null): Promise<void> {
    const snapshot = await getSync<{ disabledSites?: string[] }>("disabledSites");
    const disabledSites = Array.isArray(snapshot.disabledSites) ? [...snapshot.disabledSites] : [];
    const index = findMatchingHostnameIndex(disabledSites, hostname);

    if (index === -1) {
        disabledSites.push(hostname);
    } else {
        disabledSites.splice(index, 1);
    }

    await setSync({ disabledSites });
    await applyRulesForCurrentTab(tabId);
}

export async function toggleSiteRule(
    key: "isolationModeSites" | "forgetfulSites",
    hostname: string,
    tabId?: number | null,
): Promise<void> {
    const snapshot = await getSync<Record<string, Array<{ value: string; enabled: boolean }>>>(key);
    const current = Array.isArray(snapshot[key]) ? [...snapshot[key]] : [];
    const existing = findMatchingToggleableRule(current, hostname);

    if (existing) {
        existing.enabled = existing.enabled === false;
    } else {
        current.push({ value: hostname, enabled: true });
    }

    await setSync({ [key]: current });
    await applyRulesForCurrentTab(tabId);
}

export async function stopFocusMode(): Promise<void> {
    await sendMessage({ type: "STOP_FOCUS_MODE" });
}

export async function startInspector(tabId: number, mode: "default" | "wall-recovery" = "default"): Promise<void> {
    await sendContentMessage(tabId, { type: "START_INSPECTOR_MODE", mode }, { frameId: 0 });
    closePopupSoon();
}

export async function startZapper(tabId: number): Promise<void> {
    await sendContentMessage(tabId, { type: "START_ZAPPER_MODE" }, { frameId: 0 });
    closePopupSoon();
}

export async function openLogger(tabId: number, review = false): Promise<void> {
    await openLoggerPage({
        tabId,
        status: review ? "allowed" : undefined,
        review: review ? "needs-review" : undefined,
    });
    closePopupSoon();
}

export async function openAnalyzer(tabId: number): Promise<void> {
    await openAnalyzerPage(tabId);
    closePopupSoon();
}

export async function openSettings(): Promise<void> {
    await openOptionsPage();
    closePopupSoon();
}

export async function copySiteReportPackage(
    snapshot: PopupSnapshot,
    policy: SitePolicyState,
    toolActivity: ToolActivityEntry[],
): Promise<ToolStatusCard> {
    const report = buildSiteReportPackage(snapshot, policy, toolActivity);
    await copyTextToClipboard(report);
    const card: ToolStatusCard = {
        title: "Site Report Copied",
        message: "Copied the current site report. Paste it with a short note about the visible issue.",
        tone: "success",
        actionLabel: "Open Logger Review",
        action: "open-logger-review",
    };
    await appendToolActivitySafely("Site Report", snapshot.hostname, card);
    return card;
}

export async function copyReviewCandidateList(snapshot: PopupSnapshot): Promise<ToolStatusCard> {
    const reviewList = buildReviewCandidateList(snapshot);
    await copyTextToClipboard(reviewList);
    const card: ToolStatusCard = {
        title: "Review List Copied",
        message: "Copied a redacted review-candidate list. Open Logger Review for full request details.",
        tone: "success",
        actionLabel: "Open Logger Review",
        action: "open-logger-review",
    };
    await appendToolActivitySafely("Review List", snapshot.hostname, card);
    return card;
}

export async function runPageTool(
    actionType: PageToolActionType,
    tabId: number,
    hostname: string,
): Promise<ToolStatusCard | null> {
    if (actionType === "START_ZAPPER_MODE") {
        try {
            await startZapper(tabId);
            return null;
        } catch (error) {
            const card = mapToolLaunchError(error instanceof Error ? error.message : String(error), "Zapper");
            await appendToolActivity("Zapper", hostname, card);
            return card;
        }
    }

    if (actionType === "START_INSPECTOR_MODE") {
        try {
            await startInspector(tabId);
            return null;
        } catch (error) {
            const card = mapToolLaunchError(error instanceof Error ? error.message : String(error), "Inspector");
            await appendToolActivity("Inspector", hostname, card);
            return card;
        }
    }

    if (actionType === "OPEN_LOGGER") {
        await openLogger(tabId);
        return null;
    }

    if (actionType === "FIX_COOKIES") {
        try {
            const response = await sendMessage<CookieConsentResponse>({
                type: "HANDLE_COOKIE_CONSENT",
                data: { tabId },
            });

            if (response?.error) {
                const card = mapAiToolError(response.error, "Fix Cookies");
                await appendToolActivitySafely("Fix Cookies", hostname, card);
                return card;
            }

            const card: ToolStatusCard = response?.result?.selector
                ? {
                    title: "Cookie Action Applied",
                    message: "ZenithGuard triggered a consent action on the page. Check the page state before closing the popup.",
                    tone: "success",
                }
                : {
                    title: "No Clear Cookie Action",
                    message: "Gemini did not find an obvious consent control on this page. Try the site manually or use Inspector if needed.",
                    tone: "info",
                };
            await appendToolActivitySafely("Fix Cookies", hostname, card);
            return card;
        } catch (error) {
            const card = mapAiToolError(error instanceof Error ? error.message : String(error), "Fix Cookies");
            await appendToolActivitySafely("Fix Cookies", hostname, card);
            return card;
        }
    }

    if (actionType === "DEFEAT_WALL") {
        try {
            const response = await sendMessage<DefeatAdblockWallResponse<TemporaryWallFix>>({
                type: "DEFEAT_ADBLOCK_WALL",
                data: { tabId },
            });

            if (response?.error) {
                const card = mapAiToolError(response.error, "Defeat Wall");
                await appendToolActivitySafely("Experimental Wall Assist", hostname, card);
                return card;
            }

            if (response?.selectors) {
                try {
                    const { temporaryWallFixes = {} } = await getLocal<{ temporaryWallFixes?: Record<string, TemporaryWallFix> }>("temporaryWallFixes");
                    const wallFixKey = findMatchingRecordKey(temporaryWallFixes, hostname) || hostname;
                    await setLocal({
                        temporaryWallFixes: normalizeTemporaryWallFixMap({
                            ...temporaryWallFixes,
                            [wallFixKey]: response.selectors,
                        }),
                    });
                } catch (error) {
                    console.warn("ZenithGuard: Failed to persist temporary wall fix.", error);
                }

                const hasUnlockTarget = Boolean(response.selectors.contentUnlockSelector?.trim());
                const card: ToolStatusCard = {
                    title: hasUnlockTarget ? "Temporary Wall Fix Applied" : "Partial Wall Fix Applied",
                    message: hasUnlockTarget
                        ? "Check the page now. If it really helped, save it. If it broke the page, discard it."
                        : "Gemini found an overlay to hide, but no strong content unlock target. The wall may still remain. Check Wall Fix Details before saving.",
                    tone: hasUnlockTarget ? "success" : "info",
                    actionLabel: hasUnlockTarget ? "Review in Tools" : "Open Inspector",
                    action: hasUnlockTarget ? "review-wall-fix" : "open-inspector-wall",
                };
                await appendToolActivitySafely("Experimental Wall Assist", hostname, card);
                return card;
            }

            const card: ToolStatusCard = {
                title: "No Useful Wall Fix Found",
                message: "Gemini did not return a selector set worth applying on this page. Use Inspector for a real manual cleanup instead of retrying blindly.",
                tone: "info",
                actionLabel: "Open Inspector",
                action: "open-inspector-wall",
            };
            await appendToolActivitySafely("Experimental Wall Assist", hostname, card);
            return card;
        } catch (error) {
            const card = mapAiToolError(error instanceof Error ? error.message : String(error), "Defeat Wall");
            await appendToolActivitySafely("Experimental Wall Assist", hostname, card);
            return card;
        }
    }

    return null;
}

export async function saveTemporaryWallFix(hostname: string): Promise<void> {
    const [localSnapshot, syncSnapshot] = await Promise.all([
        getLocal<{ temporaryWallFixes?: Record<string, TemporaryWallFix> }>("temporaryWallFixes"),
        getSync<{ persistentWallFixes?: Record<string, { enabled?: boolean } & TemporaryWallFix> }>("persistentWallFixes"),
    ]);

    const temporaryKey = findMatchingRecordKey(localSnapshot.temporaryWallFixes, hostname) || hostname;
    const temporaryFix = localSnapshot.temporaryWallFixes?.[temporaryKey];
    if (!temporaryFix) {
        return;
    }
    const persistentKey = findMatchingRecordKey(syncSnapshot.persistentWallFixes, hostname) || temporaryKey;

    const nextTemporaryWallFixes = { ...(localSnapshot.temporaryWallFixes || {}) };
    delete nextTemporaryWallFixes[temporaryKey];

    await Promise.all([
        setSync({
            persistentWallFixes: normalizePersistentWallFixMap({
                ...(syncSnapshot.persistentWallFixes || {}),
                [persistentKey]: {
                    ...temporaryFix,
                    enabled: true,
                },
            }),
        }),
        setLocal({ temporaryWallFixes: normalizeTemporaryWallFixMap(nextTemporaryWallFixes) }),
    ]);
    await appendToolActivitySafely("Experimental Wall Assist", hostname, {
        title: "Wall Fix Saved",
        message: "Saved the current temporary wall fix for future visits to this site.",
        tone: "success",
    });
}

export async function discardTemporaryWallFix(hostname: string, tabId?: number | null): Promise<void> {
    const snapshot = await getLocal<{ temporaryWallFixes?: Record<string, TemporaryWallFix> }>("temporaryWallFixes");
    const nextState = { ...(snapshot.temporaryWallFixes || {}) };
    const temporaryKey = findMatchingRecordKey(nextState, hostname) || hostname;
    delete nextState[temporaryKey];
    await setLocal({ temporaryWallFixes: normalizeTemporaryWallFixMap(nextState) });
    await reloadTab(tabId);
    await appendToolActivitySafely("Experimental Wall Assist", hostname, {
        title: "Temporary Wall Fix Discarded",
        message: "Discarded the temporary wall fix and reloaded the page cleanly.",
        tone: "info",
    });
}

export async function removeSavedWallFix(hostname: string, tabId?: number | null): Promise<void> {
    const snapshot = await getSync<{ persistentWallFixes?: Record<string, Record<string, unknown>> }>("persistentWallFixes");
    const nextState = { ...(snapshot.persistentWallFixes || {}) };
    const savedKey = findMatchingRecordKey(nextState, hostname) || hostname;
    delete nextState[savedKey];
    await setSync({ persistentWallFixes: normalizePersistentWallFixMap(nextState) });
    await reloadTab(tabId);
    await appendToolActivitySafely("Experimental Wall Assist", hostname, {
        title: "Saved Wall Fix Removed",
        message: "Removed the saved wall fix for this site and reloaded the page.",
        tone: "info",
    });
}

export async function clearToolActivity(hostname: string): Promise<void> {
    const snapshot = await getLocal<{ toolActivityLog?: ToolActivityEntry[] }>("toolActivityLog");
    const current = Array.isArray(snapshot.toolActivityLog) ? snapshot.toolActivityLog : [];

    await setLocal({
        toolActivityLog: current.filter((entry) => !entry.domain || !hostnamesMatch(entry.domain, hostname)),
    });
}

export async function clearProtectionPauseTimer(): Promise<void> {
    await removeLocal("protectionPausedUntil");
}

export async function removeHiddenRule(hostname: string, index: number): Promise<void> {
    const snapshot = await getSync<{ customHidingRules?: Record<string, Array<{ value: string; enabled: boolean }>> }>("customHidingRules");
    const currentRules = snapshot.customHidingRules && typeof snapshot.customHidingRules === "object"
        ? { ...snapshot.customHidingRules }
        : {};

    const matchedHostname = findMatchingRecordKey(currentRules, hostname) || hostname;
    const domainRules = Array.isArray(currentRules[matchedHostname]) ? [...currentRules[matchedHostname]] : [];
    const removedRule = domainRules[index];
    if (!removedRule) {
        return;
    }

    domainRules.splice(index, 1);

    if (domainRules.length === 0) {
        delete currentRules[matchedHostname];
    } else {
        currentRules[matchedHostname] = domainRules;
    }

    await setSync({ customHidingRules: normalizeCustomHidingRuleBuckets(currentRules) });
    await sendMessage({ type: "REAPPLY_HIDING_RULES" });
    await appendToolActivitySafely("Saved Cleanup", hostname, {
        title: "Hidden Rule Removed",
        message: `Removed saved hiding rule: ${removedRule.value}`,
        tone: "info",
    });
}
