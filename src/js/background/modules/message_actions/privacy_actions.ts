export type PrivacyStats = {
    grade: string;
    score: number;
    trackersDetected: number;
    trackersBlocked: number;
    trackersFound: Array<{
        id: string;
        name: string;
        category: string;
    }>;
};

export type NetworkLogEntry = {
    id?: number;
    url: string;
    status: string;
    type?: string;
    [key: string]: unknown;
};

export type NetworkLogSnapshot = {
    entries: NetworkLogEntry[];
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
};

export type PrivacyActionDeps = {
    getPrivacyStats: (tabId: number) => PrivacyStats | Promise<PrivacyStats>;
    getNetworkLogs: (tabId: number) => NetworkLogEntry[] | Promise<NetworkLogEntry[]>;
    getNetworkLogSnapshot?: (tabId: number) => NetworkLogSnapshot | Promise<NetworkLogSnapshot>;
    clearNetworkLogs: (tabId: number) => void | Promise<void>;
    resetPrivacyStats?: (tabId: number) => void | Promise<void>;
    broadcastNetworkLogReset?: (tabId: number, sessionStartedAt: number | null) => void | Promise<void>;
    getPrivacyInsights?: (tabId: number) => unknown[] | Promise<unknown[]>;
};

export function createPrivacyActionRegistry(deps: PrivacyActionDeps) {
    return {
        actions: {
            GET_PRIVACY_STATS: async (message: { tabId: number }) => deps.getPrivacyStats(message.tabId),
            GET_NETWORK_LOG: async (
                message: { tabId?: number },
                sender: chrome.runtime.MessageSender,
            ) => {
                const tabId = message.tabId ?? sender.tab?.id;
                if (typeof tabId !== "number") {
                    return { entries: [], sessionStartedAt: null, lastUpdatedAt: null };
                }

                if (deps.getNetworkLogSnapshot) {
                    return deps.getNetworkLogSnapshot(tabId);
                }

                return {
                    entries: await deps.getNetworkLogs(tabId),
                    sessionStartedAt: null,
                    lastUpdatedAt: null,
                };
            },
            CLEAR_NETWORK_LOG: async (message: { tabId?: number }) => {
                if (typeof message.tabId === "number") {
                    await deps.clearNetworkLogs(message.tabId);
                    if (deps.resetPrivacyStats) {
                        await deps.resetPrivacyStats(message.tabId);
                    }

                    if (deps.broadcastNetworkLogReset) {
                        const snapshot = deps.getNetworkLogSnapshot
                            ? await deps.getNetworkLogSnapshot(message.tabId)
                            : { sessionStartedAt: null };
                        await deps.broadcastNetworkLogReset(message.tabId, snapshot.sessionStartedAt ?? null);
                    }
                }
                return { success: true };
            },
            GET_PRIVACY_INSIGHTS: async (message: { tabId: number }) => {
                if (!deps.getPrivacyInsights) {
                    return [];
                }
                return deps.getPrivacyInsights(message.tabId);
            },
        },
    };
}
