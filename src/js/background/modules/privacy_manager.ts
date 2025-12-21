import { PrivacyStats, PrivacyGrade, TrackerDefinition } from '../../types.js';
import { getLatestTrackerList } from './tracker_list_updater.js';

export class PrivacyManager {
    private stats: Map<number, PrivacyStats> = new Map();
    private trackerCache: any = null;

    constructor() {
        this.loadTrackers();
    }

    async loadTrackers() {
        this.trackerCache = await getLatestTrackerList();
    }

    // Called when a tab updates or navigates
    resetStats(tabId: number) {
        this.stats.set(tabId, {
            grade: 'A',
            score: 100,
            trackersBlocked: 0,
            trackersFound: []
        });
        this.updateBadge(tabId);
    }

    getStats(tabId: number): PrivacyStats {
        return this.stats.get(tabId) || { grade: 'A', score: 100, trackersBlocked: 0, trackersFound: [] };
    }

    // Called by webRequest or DNR debug listener
    processRequest(tabId: number, url: string) {
        if (!this.trackerCache) return; // Not ready
        if (!url) return;

        try {
            const hostname = new URL(url).hostname;
            const category = this.categorizeTracker(hostname);

            if (category) {
                const current = this.getStats(tabId);

                // Avoid duplicates for the same tracker domain
                if (!current.trackersFound.some(t => t.name === hostname)) {
                    current.trackersFound.push({
                        id: hostname,
                        name: hostname,
                        category: category
                    });
                    current.trackersBlocked++;
                    this.recalculateScore(current);
                    this.stats.set(tabId, current);
                    this.updateBadge(tabId);
                }
            }
        } catch (e) {
            // Ignore invalid URLs
        }
    }

    private categorizeTracker(hostname: string): TrackerDefinition['category'] | null {
        // Simple heuristic matching against our cache structure
        // structure: { "SESSION_REPLAY": { domains: [...] }, ... }

        for (const [key, data] of Object.entries(this.trackerCache)) {
            // @ts-ignore
            if (data.domains && data.domains.some(d => hostname.includes(d))) {
                return this.mapCategory(key);
            }
        }
        return null;
    }

    private mapCategory(key: string): TrackerDefinition['category'] {
        switch (key) {
            case 'ADVERTISING': return 'Advertising';
            case 'ANALYTICS': return 'Analytics';
            case 'FINGERPRINTING': return 'Fingerprinting';
            case 'SESSION_REPLAY': return 'Fingerprinting'; // High severity
            case 'SOCIAL': return 'Social';
            case 'CRYPTOMINING': return 'Cryptomining';
            default: return 'Unknown';
        }
    }

    private recalculateScore(stats: PrivacyStats) {
        let score = 100;

        for (const tracker of stats.trackersFound) {
            switch (tracker.category) {
                case 'Fingerprinting': score -= 15; break; // Severe
                case 'Cryptomining': score -= 20; break; // Severe
                case 'Advertising': score -= 5; break;
                case 'Analytics': score -= 5; break;
                case 'Social': score -= 10; break;
            }
        }

        stats.score = Math.max(0, score);
        stats.grade = this.getGrade(stats.score);
    }

    private getGrade(score: number): PrivacyGrade {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 50) return 'D';
        return 'F';
    }

    private updateBadge(tabId: number) {
        const stats = this.getStats(tabId);
        const colorMap: Record<PrivacyGrade, string> = {
            'A': '#4ade80', // Green
            'B': '#a3e635', // Lime
            'C': '#facc15', // Yellow
            'D': '#fb923c', // Orange
            'F': '#f87171'  // Red
        };

        chrome.action.setBadgeText({ tabId, text: stats.grade });
        chrome.action.setBadgeBackgroundColor({ tabId, color: colorMap[stats.grade] });
    }
}
