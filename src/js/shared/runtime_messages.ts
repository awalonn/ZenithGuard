import type { ContentMessage } from "./content_messages";

export const BACKGROUND_ACTION_MESSAGE_TYPES = [
    "GET_PRIVACY_STATS",
    "TOGGLE_GLOBAL_PROTECTION",
    "APPLY_RULES_AND_RELOAD_TAB",
    "APPLY_ALL_RULES",
    "ANALYZE_PAGE_WITH_AI",
    "HIDE_ELEMENT_WITH_AI",
    "DEFEAT_ADBLOCK_WALL",
    "HANDLE_COOKIE_CONSENT",
    "API_KEY_UPDATED",
    "SELF_HEAL_RULE",
    "GET_NETWORK_LOG",
    "CLEAR_NETWORK_LOG",
    "ADD_TO_NETWORK_BLOCKLIST",
    "BULK_ADD_RULES",
    "TEMPORARILY_ALLOW_DOMAIN",
    "PAUSE_PROTECTION",
    "RESUME_PROTECTION",
    "GET_PRIVACY_INSIGHTS",
    "START_FOCUS_MODE",
    "STOP_FOCUS_MODE",
    "RESET_SETTINGS_TO_DEFAULTS",
    "REAPPLY_HIDING_RULES",
    "CLASSIFY_TEXT_LOCALLY",
] as const;

export type BackgroundActionMessageType = typeof BACKGROUND_ACTION_MESSAGE_TYPES[number];

export const SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES = [
    "APPLY_ALL_RULES",
    "PAUSE_PROTECTION",
    "RESUME_PROTECTION",
    "STOP_FOCUS_MODE",
    "RESET_SETTINGS_TO_DEFAULTS",
    "REAPPLY_HIDING_RULES",
    "API_KEY_UPDATED",
] as const;

export type SimpleBackgroundActionMessageType = typeof SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES[number];

export const NETWORK_BLOCKLIST_SOURCES = ["analyzer", "logger", "settings", "inspector", "local-ai"] as const;

export type NetworkBlocklistSource = typeof NETWORK_BLOCKLIST_SOURCES[number];

export type BackgroundActionMessage =
    | { type: "GET_PRIVACY_STATS"; tabId: number }
    | { type: "TOGGLE_GLOBAL_PROTECTION"; data: { isEnabled: boolean } }
    | { type: "APPLY_RULES_AND_RELOAD_TAB"; data?: { tabId?: number } }
    | { type: SimpleBackgroundActionMessageType }
    | { type: "ANALYZE_PAGE_WITH_AI"; data: { tabId: number; pageUrl: string } }
    | { type: "HIDE_ELEMENT_WITH_AI"; data: { description: string; context?: Record<string, unknown> } }
    | { type: "DEFEAT_ADBLOCK_WALL"; data: { tabId: number } }
    | { type: "HANDLE_COOKIE_CONSENT"; data: { tabId: number } }
    | { type: "SELF_HEAL_RULE"; data: { selector: string; pageUrl: string } }
    | { type: "GET_NETWORK_LOG" | "CLEAR_NETWORK_LOG"; tabId?: number }
    | { type: "ADD_TO_NETWORK_BLOCKLIST"; domain: string; source?: NetworkBlocklistSource }
    | { type: "BULK_ADD_RULES"; data: { networkBlocklist: string[]; customHidingRules: { domain: string; selectors: string[] } } }
    | { type: "TEMPORARILY_ALLOW_DOMAIN"; domain: string }
    | { type: "GET_PRIVACY_INSIGHTS"; tabId: number }
    | { type: "START_FOCUS_MODE"; duration: number }
    | { type: "CLASSIFY_TEXT_LOCALLY"; data: { text: string } };

export type NetworkLogUpdateMessage = {
    type: "NETWORK_LOG_UPDATE";
    tabId: number;
    log: {
        id: number;
        url: string;
        status: string;
        timestamp: number;
        [key: string]: unknown;
    };
};

export type NetworkLogResetMessage = {
    type: "NETWORK_LOG_RESET";
    tabId: number;
    sessionStartedAt: number | null;
};

export type RuntimeNotificationMessage = NetworkLogUpdateMessage | NetworkLogResetMessage;

export type PrivacyStatsResponse = {
    grade?: string;
    score?: number;
    trackersDetected: number;
    trackersBlocked: number;
    trackersFound?: Array<{
        id: string;
        name: string;
        category: string;
    }>;
};

export type NetworkLogEntryResponse = {
    id?: number;
    url: string;
    type?: string;
    initiator?: string;
    timestamp?: number;
    status: string;
    statusUpdated?: boolean;
    matchedRuleInfo?: {
        ruleId?: number;
        source?: string;
        category?: string;
        detail?: string;
        matchedValue?: string;
    };
    [key: string]: unknown;
};

export type NetworkLogSnapshotResponse = {
    entries: NetworkLogEntryResponse[];
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
};

export type ActionStatusResponse = {
    success?: boolean;
    message?: string;
};

export type AnalyzePageWithAiResponse<T = unknown> = {
    success?: boolean;
    result?: T;
    error?: string;
};

export type HideElementWithAiResponse = {
    selector?: string;
    error?: string;
};

export type SelfHealRuleResponse = {
    newSelector?: string;
    error?: string;
};

export type LocalAiClassificationResponse = {
    isAdRelated: boolean;
    confidence: number;
    error?: string;
};

export type CookieConsentResponse = {
    error?: string;
    result?: {
        selector?: string | null;
        action?: string | null;
    };
};

export type DefeatAdblockWallResponse<TSelectors = Record<string, unknown>> = {
    error?: string;
    selectors?: TSelectors;
};

export function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

export function isNetworkLogUpdateMessage(value: unknown): value is NetworkLogUpdateMessage {
    if (!isObjectLike(value)) {
        return false;
    }

    const log = value.log;
    return value.type === "NETWORK_LOG_UPDATE"
        && typeof value.tabId === "number"
        && isObjectLike(log)
        && typeof log.id === "number"
        && typeof log.url === "string"
        && typeof log.status === "string"
        && typeof log.timestamp === "number";
}

export function isNetworkLogResetMessage(value: unknown): value is NetworkLogResetMessage {
    return isObjectLike(value)
        && value.type === "NETWORK_LOG_RESET"
        && typeof value.tabId === "number"
        && (typeof value.sessionStartedAt === "number" || value.sessionStartedAt === null);
}

function getRuntimeLastErrorMessage(): string | null {
    return chrome.runtime.lastError?.message || null;
}

export function sendMessage<TResponse = unknown>(message: BackgroundActionMessage): Promise<TResponse> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response: TResponse) => {
            const errorMessage = getRuntimeLastErrorMessage();
            if (errorMessage) {
                reject(new Error(errorMessage));
                return;
            }

            resolve(response);
        });
    });
}

export function sendMessageSafely(message: BackgroundActionMessage | RuntimeNotificationMessage): void {
    chrome.runtime.sendMessage(message).catch(() => {});
}

export async function sendContentMessage<TResponse = unknown>(
    tabId: number,
    message: ContentMessage,
    options?: chrome.tabs.MessageSendOptions,
): Promise<TResponse> {
    return chrome.tabs.sendMessage(tabId, message, options);
}

export function sendContentMessageSafely(
    tabId: number,
    message: ContentMessage,
    options?: chrome.tabs.MessageSendOptions,
): Promise<unknown> {
    return sendContentMessage(tabId, message, options).catch(() => {});
}

export async function getPrivacyStats(tabId: number): Promise<PrivacyStatsResponse> {
    return sendMessage({ type: "GET_PRIVACY_STATS", tabId });
}

export async function getNetworkLog(tabId?: number): Promise<NetworkLogSnapshotResponse> {
    return sendMessage({ type: "GET_NETWORK_LOG", tabId });
}

export async function classifyTextLocally(text: string): Promise<LocalAiClassificationResponse> {
    return sendMessage({ type: "CLASSIFY_TEXT_LOCALLY", data: { text } });
}

export async function addToNetworkBlocklist(domain: string, source?: NetworkBlocklistSource): Promise<ActionStatusResponse> {
    return sendMessage({ type: "ADD_TO_NETWORK_BLOCKLIST", domain, source });
}

export async function analyzePageWithAi<T = unknown>(tabId: number, pageUrl: string): Promise<AnalyzePageWithAiResponse<T>> {
    return sendMessage({
        type: "ANALYZE_PAGE_WITH_AI",
        data: { tabId, pageUrl },
    });
}

export async function hideElementWithAi(description: string, context?: Record<string, unknown> | null): Promise<HideElementWithAiResponse> {
    return sendMessage({
        type: "HIDE_ELEMENT_WITH_AI",
        data: context ? { description, context } : { description },
    });
}

export async function selfHealRule(selector: string, pageUrl: string): Promise<SelfHealRuleResponse> {
    return sendMessage({
        type: "SELF_HEAL_RULE",
        data: { selector, pageUrl },
    });
}

export function notifyApiKeyUpdated(): void {
    sendMessageSafely({ type: "API_KEY_UPDATED" });
}
