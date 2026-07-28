import { TrackerRegistry } from "./privacy/tracker_registry";

export type PrivacyTrackerFinding = {
    id: string;
    name: string;
    category: string;
};

export type PrivacyStats = {
    grade: string;
    score: number;
    trackersDetected: number;
    trackersBlocked: number;
    trackersFound: PrivacyTrackerFinding[];
};

const PRIVACY_BADGE_COLORS: Record<string, string> = {
    A: "#4ade80",
    B: "#a3e635",
    C: "#facc15",
    D: "#fb923c",
    F: "#f87171",
};

function createDefaultPrivacyStats(): PrivacyStats {
    return {
        grade: "A",
        score: 100,
        trackersDetected: 0,
        trackersBlocked: 0,
        trackersFound: [],
    };
}

function scoreToGrade(score: number): string {
    if (score >= 90) {
        return "A";
    }
    if (score >= 80) {
        return "B";
    }
    if (score >= 70) {
        return "C";
    }
    if (score >= 50) {
        return "D";
    }
    return "F";
}

function recomputePrivacyScore(stats: PrivacyStats): void {
    let score = 100;

    for (const tracker of stats.trackersFound) {
        switch (tracker.category) {
            case "Fingerprinting":
                score -= 15;
                break;
            case "Cryptomining":
                score -= 20;
                break;
            case "Advertising":
                score -= 5;
                break;
            case "Analytics":
                score -= 5;
                break;
            case "Social":
                score -= 10;
                break;
            default:
                break;
        }
    }

    stats.score = Math.max(0, score);
    stats.grade = scoreToGrade(stats.score);
}

function isLikelyStaticAsset(url: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|woff2|woff|ttf|css)$/i.test(url) && !url.includes("?");
}

function isInspectableHostname(hostname: string): boolean {
    return hostname.length >= 4;
}

function updateBadge(tabId: number, grade: string): void {
    chrome.action.setBadgeText({ tabId, text: grade });
    chrome.action.setBadgeBackgroundColor({
        tabId,
        color: PRIVACY_BADGE_COLORS[grade] || PRIVACY_BADGE_COLORS.F,
    });
}

class PrivacyStatsStore {
    private readonly statsByTab = new Map<number, PrivacyStats>();

    reset(tabId: number): PrivacyStats {
        const stats = createDefaultPrivacyStats();
        this.statsByTab.set(tabId, stats);
        return stats;
    }

    get(tabId: number): PrivacyStats {
        return this.statsByTab.get(tabId) || createDefaultPrivacyStats();
    }

    remove(tabId: number): void {
        this.statsByTab.delete(tabId);
    }

    addTracker(tabId: number, hostname: string, category: string): boolean {
        const stats = this.get(tabId);
        if (stats.trackersFound.some((tracker) => tracker.name === hostname)) {
            return false;
        }

        stats.trackersFound.push({
            id: hostname,
            name: hostname,
            category,
        });
        stats.trackersDetected = stats.trackersFound.length;
        recomputePrivacyScore(stats);
        this.statsByTab.set(tabId, stats);
        return true;
    }
}

export class PrivacyRuntime {
    private readonly statsStore = new PrivacyStatsStore();
    private readonly trackerRegistry = new TrackerRegistry();

    constructor(private readonly refreshIntervalMs = 600_000) {
        this.trackerRegistry = new TrackerRegistry(refreshIntervalMs);
        void this.loadTrackers();
    }

    async loadTrackers(forceRefresh = false): Promise<void> {
        await this.trackerRegistry.load(forceRefresh);
    }

    resetStats(tabId: number): void {
        this.statsStore.reset(tabId);
        this.updateBadge(tabId);
    }

    getStats(tabId: number): PrivacyStats {
        return this.statsStore.get(tabId);
    }

    removeStats(tabId: number): void {
        this.statsStore.remove(tabId);
    }

    processRequest(tabId: number, url: string): void {
        if (!this.trackerRegistry.hasData() || !url) {
            return;
        }

        this.trackerRegistry.refreshIfStale();

        if (isLikelyStaticAsset(url)) {
            return;
        }

        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (!isInspectableHostname(hostname)) {
                return;
            }

            const resolution = this.trackerRegistry.resolveHost(hostname);
            if (!resolution) {
                return;
            }

            if (this.statsStore.addTracker(tabId, resolution.domain, resolution.category)) {
                this.updateBadge(tabId);
            }
        } catch {
            // Ignore malformed or privileged URLs.
        }
    }

    updateBadge(tabId: number): void {
        const stats = this.getStats(tabId);
        updateBadge(tabId, stats.grade);
    }
}

let privacyRuntimeSingleton: PrivacyRuntime | null = null;

export function getPrivacyRuntime(): PrivacyRuntime {
    if (!privacyRuntimeSingleton) {
        privacyRuntimeSingleton = new PrivacyRuntime();
    }

    return privacyRuntimeSingleton;
}

export function attachPrivacyRuntime(): void {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            if (details.tabId > -1 && details.url) {
                getPrivacyRuntime().processRequest(details.tabId, details.url);
            }
            return {};
        },
        { urls: ["<all_urls>"] },
    );

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === "loading") {
            getPrivacyRuntime().resetStats(tabId);
        }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
        getPrivacyRuntime().removeStats(tabId);
    });
}
