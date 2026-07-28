import { getCachedTrackerDefinitions } from "../tracker_metadata_cache";

function mapInsightCategoryToTrackerCategory(category: string): string {
    switch (category) {
        case "AD_EXCHANGE":
        case "DATA_BROKER":
        case "ADVERTISING":
            return "Advertising";
        case "ANALYTICS":
        case "AI_SCRAPERS":
            return "Analytics";
        case "FINGERPRINTING":
        case "SESSION_REPLAY":
            return "Fingerprinting";
        case "SOCIAL":
        case "SOCIAL_WIDGETS":
            return "Social";
        case "CRYPTOMINING":
        case "CRYPTOJACKING":
            return "Cryptomining";
        default:
            return "Unknown";
    }
}

function buildTrackerDomainMap(definitions: Record<string, { domains?: string[] }>): Map<string, string> {
    const domainMap = new Map<string, string>();

    for (const [category, definition] of Object.entries(definitions)) {
        const mappedCategory = mapInsightCategoryToTrackerCategory(category);
        const domains = Array.isArray(definition?.domains) ? definition.domains : [];

        for (const domain of domains) {
            const normalized = String(domain).trim().toLowerCase();
            if (!normalized || domainMap.has(normalized)) {
                continue;
            }
            domainMap.set(normalized, mappedCategory);
        }
    }

    return domainMap;
}

export type TrackerResolution = {
    domain: string;
    category: string;
};

function findResolutionForHostname(hostname: string, domainMap: Map<string, string>): TrackerResolution | null {
    let candidate = hostname;
    while (candidate.length > 0) {
        const category = domainMap.get(candidate);
        if (category) {
            return {
                domain: candidate,
                category,
            };
        }

        const separatorIndex = candidate.indexOf(".");
        if (separatorIndex === -1) {
            break;
        }
        candidate = candidate.slice(separatorIndex + 1);
    }

    return null;
}

export class TrackerRegistry {
    private trackerCache: Record<string, { domains?: string[] }> | null = null;
    private trackerDomainMap = new Map<string, string>();
    private isLoadingTrackers = false;
    private lastTrackerRefresh = 0;

    constructor(private readonly refreshIntervalMs = 600_000) {}

    async load(forceRefresh = false): Promise<void> {
        if (this.isLoadingTrackers || (!forceRefresh && this.isFresh())) {
            return;
        }

        this.isLoadingTrackers = true;
        try {
            const trackerDefinitions = await getCachedTrackerDefinitions();
            if (!trackerDefinitions) {
                return;
            }

            this.trackerCache = trackerDefinitions;
            this.trackerDomainMap = buildTrackerDomainMap(this.trackerCache);
            this.lastTrackerRefresh = Date.now();
        } finally {
            this.isLoadingTrackers = false;
        }
    }

    hasData(): boolean {
        return this.trackerCache !== null;
    }

    refreshIfStale(): void {
        if (!this.isFresh()) {
            void this.load(true);
        }
    }

    resolveHost(hostname: string): TrackerResolution | null {
        return findResolutionForHostname(hostname, this.trackerDomainMap);
    }

    categorizeHost(hostname: string): string | null {
        return this.resolveHost(hostname)?.category || null;
    }

    isFresh(now = Date.now()): boolean {
        return now - this.lastTrackerRefresh < this.refreshIntervalMs;
    }
}
