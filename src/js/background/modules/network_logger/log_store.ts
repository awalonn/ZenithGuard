export type NetworkLogStatus = "allowed" | "blocked" | "modified";

export type NetworkLogEntry = {
    id: number;
    url: string;
    type: string;
    initiator?: string;
    timestamp: number;
    status: NetworkLogStatus;
    statusUpdated?: boolean;
    matchedRuleInfo?: {
        ruleId?: number;
        source?: string;
        category?: string;
        detail?: string;
        matchedValue?: string;
    };
};

export type NetworkLogSnapshot = {
    entries: NetworkLogEntry[];
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
};

export type NetworkRequestLike = {
    tabId: number;
    url: string;
    type: string;
    initiator?: string;
    timeStamp: number;
};

const MAX_LOGS_PER_TAB = 200;
const LOG_ID_SEED = Date.now();

function stripFragment(url: string): string {
    return url.split("#")[0];
}

class NetworkLogStore {
    private logsByTab: Record<number, NetworkLogEntry[]> = {};
    private urlsByTab: Record<number, Set<string>> = {};
    private metadataByTab: Record<number, { sessionStartedAt: number | null; lastUpdatedAt: number | null }> = {};
    private logCounter = 0;

    private nextLogId(): number {
        return ((LOG_ID_SEED % 1_000_000) * 1_000) + (++this.logCounter);
    }

    reset(tabId: number, sessionStartedAt: number = Date.now()): void {
        this.logsByTab[tabId] = [];
        this.urlsByTab[tabId] = new Set<string>();
        this.metadataByTab[tabId] = {
            sessionStartedAt,
            lastUpdatedAt: null,
        };
    }

    ensure(tabId: number): void {
        if (!this.logsByTab[tabId]) {
            this.reset(tabId);
        }
    }

    addRequest(request: NetworkRequestLike): NetworkLogEntry | null {
        this.ensure(request.tabId);

        if (this.urlsByTab[request.tabId].has(request.url)) {
            return null;
        }

        if (this.logsByTab[request.tabId].length >= MAX_LOGS_PER_TAB) {
            const removed = this.logsByTab[request.tabId].shift();
            if (removed) {
                this.urlsByTab[request.tabId].delete(removed.url);
            }
        }

        const logEntry: NetworkLogEntry = {
            id: this.nextLogId(),
            url: request.url,
            type: request.type,
            initiator: request.initiator,
            timestamp: request.timeStamp,
            status: "allowed",
        };

        this.logsByTab[request.tabId].push(logEntry);
        this.urlsByTab[request.tabId].add(request.url);
        this.metadataByTab[request.tabId] = {
            sessionStartedAt: this.metadataByTab[request.tabId]?.sessionStartedAt ?? Date.now(),
            lastUpdatedAt: request.timeStamp,
        };
        return logEntry;
    }

    findPendingMatchTarget(tabId: number, url: string): NetworkLogEntry | undefined {
        const normalizedUrl = stripFragment(url);
        return (this.logsByTab[tabId] || []).find((entry) => {
            return (entry.url === normalizedUrl || stripFragment(entry.url) === normalizedUrl)
                && !entry.statusUpdated;
        });
    }

    getByTab(tabId: number): NetworkLogEntry[] {
        return this.logsByTab[tabId] || [];
    }

    getSnapshotByTab(tabId: number): NetworkLogSnapshot {
        const metadata = this.metadataByTab[tabId];
        return {
            entries: this.getByTab(tabId),
            sessionStartedAt: metadata?.sessionStartedAt ?? null,
            lastUpdatedAt: metadata?.lastUpdatedAt ?? null,
        };
    }

    clearByTab(tabId?: number): void {
        if (tabId) {
            this.reset(tabId);
        }
    }

    removeByTab(tabId: number): void {
        if (this.logsByTab[tabId]) {
            delete this.logsByTab[tabId];
        }
        if (this.urlsByTab[tabId]) {
            delete this.urlsByTab[tabId];
        }
        if (this.metadataByTab[tabId]) {
            delete this.metadataByTab[tabId];
        }
    }
}

const networkLogStore = new NetworkLogStore();

export function normalizeLogMatchUrl(url: string): string {
    return stripFragment(url);
}

export function resetTabLogs(tabId: number, sessionStartedAt?: number): void {
    networkLogStore.reset(tabId, sessionStartedAt);
}

export function ensureTabLogs(tabId: number): void {
    networkLogStore.ensure(tabId);
}

export function addNetworkRequest(request: NetworkRequestLike): NetworkLogEntry | null {
    return networkLogStore.addRequest(request);
}

export function findPendingNetworkMatch(tabId: number, url: string): NetworkLogEntry | undefined {
    return networkLogStore.findPendingMatchTarget(tabId, url);
}

export function getNetworkLogsForTab(tabId: number): NetworkLogEntry[] {
    return networkLogStore.getByTab(tabId);
}

export function getNetworkLogSnapshotForTab(tabId: number): NetworkLogSnapshot {
    return networkLogStore.getSnapshotByTab(tabId);
}

export function clearNetworkLogsForTab(tabId?: number): void {
    networkLogStore.clearByTab(tabId);
}

export function removeNetworkLogsForTab(tabId: number): void {
    networkLogStore.removeByTab(tabId);
}
