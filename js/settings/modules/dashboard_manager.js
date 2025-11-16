// js/settings/modules/dashboard_manager.js

export class DashboardManager {
    constructor(syncSettings, localSettings) {
        this.syncSettings = syncSettings;
        this.localSettings = localSettings;
        this.blocksTodayEl = document.getElementById('blocks-today');
        this.totalTrackersEl = document.getElementById('total-trackers');
        this.totalAdsEl = document.getElementById('total-ads');
        // NEW: Performance Elements
        this.perfGaugeArc = document.querySelector('#performance-impact .gauge-arc');
        this.perfGaugeText = document.querySelector('#performance-impact .gauge-text');
    }

    initialize() {
        this.renderStats();
        this.renderPerformanceImpact(); // NEW
    }

    async renderStats() {
        const today = new Date().toISOString().slice(0, 10);
        const { dailyBlocks = {} } = await chrome.storage.local.get('dailyBlocks');
        const todayStats = dailyBlocks[today] || { ads: 0, trackers: 0 };
        const totalBlocks = Object.values(dailyBlocks).reduce((acc, day) => {
            acc.ads += day.ads || 0;
            acc.trackers += day.trackers || 0;
            return acc;
        }, { ads: 0, trackers: 0 });

        this.blocksTodayEl.textContent = (todayStats.ads + todayStats.trackers).toLocaleString();
        this.totalAdsEl.textContent = totalBlocks.ads.toLocaleString();
        this.totalTrackersEl.textContent = totalBlocks.trackers.toLocaleString();
    }
    
    // NEW: Render Performance Impact
    async renderPerformanceImpact() {
        const { dailyPerformance = {} } = await chrome.storage.local.get('dailyPerformance');
        const totalPerf = Object.values(dailyPerformance).reduce((acc, day) => {
            acc.totalWeight += day.totalWeight || 0;
            acc.blockedWeight += day.blockedWeight || 0;
            return acc;
        }, { totalWeight: 0, blockedWeight: 0 });

        const percentage = totalPerf.totalWeight > 0 
            ? Math.round((totalPerf.blockedWeight / totalPerf.totalWeight) * 100) 
            : 0;

        this.updateGauge(percentage);
    }

    updateGauge(percentage) {
        if (!this.perfGaugeArc || !this.perfGaugeText) return;

        const circumference = 2 * Math.PI * 54;
        const arcLength = (percentage / 100) * circumference;
        
        this.perfGaugeArc.style.strokeDasharray = `${arcLength}, ${circumference}`;
        this.perfGaugeText.textContent = `${percentage}%`;
    }
}
