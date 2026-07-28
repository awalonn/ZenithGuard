import { sendMessageSafely } from "../../../shared/runtime_messages";
import {
    addNetworkRequest,
    clearNetworkLogsForTab,
    ensureTabLogs,
    findPendingNetworkMatch,
    getNetworkLogsForTab,
    normalizeLogMatchUrl,
    removeNetworkLogsForTab,
    resetTabLogs,
    type NetworkLogEntry,
    type NetworkRequestLike,
} from "./log_store";
import { getDnrStatus, getMatchedRuleInfo, isManagedRuleset, type RuleMatchInfo } from "./dnr_pipeline";

export type RuleMatchedDebugEvent = {
    request: Pick<NetworkRequestLike, "tabId" | "url" | "type" | "initiator">;
    rule: {
        ruleId: number;
        rulesetId?: string;
    };
};

export type RuleMatchedCallbacks = {
    hasTabLogs: (tabId: number) => boolean;
    sendLogUpdate: (tabId: number, log: NetworkLogEntry) => void;
};

function createFallbackPackagedRuleInfo(): RuleMatchInfo {
    return {
        source: "Packaged Rules",
        category: "Core",
        detail: "Matched a packaged declarative rule entry.",
    };
}

export function broadcastNetworkLogUpdate(tabId: number, log: NetworkLogEntry): void {
    sendMessageSafely({
        type: "NETWORK_LOG_UPDATE",
        tabId,
        log,
    });
}

export function broadcastNetworkLogReset(tabId: number, sessionStartedAt: number | null): void {
    sendMessageSafely({
        type: "NETWORK_LOG_RESET",
        tabId,
        sessionStartedAt,
    });
}

export function createNetworkLoggerPipeline(callbacks: RuleMatchedCallbacks) {
    function handleRuleMatched(event: RuleMatchedDebugEvent): void {
        const { request, rule } = event;
        const tabId = request.tabId;

        if (!callbacks.hasTabLogs(tabId)) {
            queuePendingRuleMatch(tabId, event);
            return;
        }

        let matchedRuleInfo = getMatchedRuleInfo(rule.ruleId);
        if (rule.rulesetId && rule.rulesetId !== "_dynamic" && !isManagedRuleset(rule.rulesetId)) {
            matchedRuleInfo = createFallbackPackagedRuleInfo();
        }

        const pendingTarget = findPendingNetworkMatch(tabId, request.url);
        if (!pendingTarget) {
            queuePendingRuleMatch(tabId, event);
            return;
        }

        const status = getDnrStatus(rule.ruleId);
        pendingTarget.status = status;
        pendingTarget.matchedRuleInfo = {
            ruleId: rule.ruleId,
            source: matchedRuleInfo.source,
            category: matchedRuleInfo.category,
            detail: matchedRuleInfo.detail,
            matchedValue: matchedRuleInfo.matchedValue,
        };
        pendingTarget.statusUpdated = true;
        callbacks.sendLogUpdate(tabId, pendingTarget);
    }

    function applyPendingMatch(tabId: number, url: string, log: NetworkLogEntry): void {
        const normalizedUrl = normalizeLogMatchUrl(url);
        const pendingMatch = consumePendingRuleMatch(
            tabId,
            (candidate) => normalizeLogMatchUrl(candidate.request.url) === normalizedUrl,
        );

        if (!pendingMatch) {
            return;
        }

        let matchedRuleInfo = getMatchedRuleInfo(pendingMatch.rule.ruleId);
        if (
            pendingMatch.rule.rulesetId
            && pendingMatch.rule.rulesetId !== "_dynamic"
            && !isManagedRuleset(pendingMatch.rule.rulesetId)
        ) {
            matchedRuleInfo = createFallbackPackagedRuleInfo();
        }

        const status = getDnrStatus(pendingMatch.rule.ruleId);
        log.status = status;
        log.matchedRuleInfo = {
            ruleId: pendingMatch.rule.ruleId,
            source: matchedRuleInfo.source,
            category: matchedRuleInfo.category,
            detail: matchedRuleInfo.detail,
            matchedValue: matchedRuleInfo.matchedValue,
        };
        log.statusUpdated = true;
    }

    function clearTab(tabId: number): void {
        clearPendingRuleMatches(tabId);
    }

    return {
        handleRuleMatched,
        applyPendingMatch,
        clearTab,
    };
}

const pendingRuleMatches = new Map<number, RuleMatchedDebugEvent[]>();

function getPendingRuleMatches(tabId: number): RuleMatchedDebugEvent[] {
    return pendingRuleMatches.get(tabId) ?? [];
}

function queuePendingRuleMatch(tabId: number, event: RuleMatchedDebugEvent): void {
    const queue = getPendingRuleMatches(tabId);
    queue.push(event);
    pendingRuleMatches.set(tabId, queue);
}

function consumePendingRuleMatch(
    tabId: number,
    predicate: (event: RuleMatchedDebugEvent) => boolean,
): RuleMatchedDebugEvent | null {
    const queue = pendingRuleMatches.get(tabId);
    if (!queue || queue.length === 0) {
        return null;
    }

    const index = queue.findIndex(predicate);
    if (index < 0) {
        return null;
    }

    const [event] = queue.splice(index, 1);
    if (queue.length === 0) {
        pendingRuleMatches.delete(tabId);
    } else {
        pendingRuleMatches.set(tabId, queue);
    }

    return event ?? null;
}

function clearPendingRuleMatches(tabId: number): void {
    pendingRuleMatches.delete(tabId);
}

const networkLoggerPipeline = createNetworkLoggerPipeline({
    hasTabLogs: (tabId) => getNetworkLogsForTab(tabId).length > 0,
    sendLogUpdate: broadcastNetworkLogUpdate,
});

export function resetTabLoggingState(tabId: number, sessionStartedAt?: number): void {
    clearNetworkLogsForTab(tabId);
    clearPendingRuleMatches(tabId);
    resetTabLogs(tabId, sessionStartedAt);
    broadcastNetworkLogReset(tabId, sessionStartedAt ?? null);
}

export function removeTabLoggingState(tabId: number): void {
    removeNetworkLogsForTab(tabId);
    clearPendingRuleMatches(tabId);
}

export function handleNavigationCommitted(tabId: number, timeStamp?: number): void {
    resetTabLoggingState(tabId, timeStamp);
}

export function handleIncomingNetworkRequest(request: NetworkRequestLike): NetworkLogEntry | null {
    ensureTabLogs(request.tabId);
    const log = addNetworkRequest(request);
    if (log) {
        networkLoggerPipeline.applyPendingMatch(request.tabId, request.url, log);
        broadcastNetworkLogUpdate(request.tabId, log);
    }
    return log;
}

export function handleRuleMatchedDebugEvent(event: RuleMatchedDebugEvent): void {
    networkLoggerPipeline.handleRuleMatched(event);
}

export function toRuleMatchedDebugEvent(event: chrome.declarativeNetRequest.MatchedRuleInfoDebug): RuleMatchedDebugEvent {
    return {
        request: {
            tabId: event.request.tabId,
            url: event.request.url,
            type: event.request.type,
            initiator: event.request.initiator,
        },
        rule: {
            ruleId: event.rule.ruleId,
            rulesetId: event.rule.rulesetId,
        },
    };
}

function handleCommittedNavigation(details: chrome.webNavigation.WebNavigationFramedCallbackDetails): void {
    if (details.frameId === 0) {
        handleNavigationCommitted(details.tabId, details.timeStamp);
    }
}

function attachRuleMatchedDebugRuntime(): void {
    if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
        chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((event) => {
            handleRuleMatchedDebugEvent(toRuleMatchedDebugEvent(event));
        });
    }
}

function handleBeforeRequest(details: {
    tabId: number;
    url: string;
    type: string;
    initiator?: string;
    timeStamp: number;
}): chrome.webRequest.BlockingResponse {
    handleIncomingNetworkRequest({
        tabId: details.tabId,
        url: details.url,
        type: details.type,
        initiator: details.initiator,
        timeStamp: details.timeStamp,
    });
    return {};
}

export function attachNetworkLoggerRuntime(): void {
    chrome.webNavigation.onCommitted.addListener(handleCommittedNavigation);
    attachRuleMatchedDebugRuntime();
    chrome.webRequest.onBeforeRequest.addListener(handleBeforeRequest, { urls: ["<all_urls>"] });
    chrome.tabs.onRemoved.addListener((tabId) => {
        removeTabLoggingState(tabId);
    });
}
