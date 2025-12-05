// js/settings/modules/dashboard_manager.ts
import { AppSettings } from '../../types.js';

interface DailyStat {
    ads: number;
    trackers: number;
}

interface DailyPerformance {
    totalWeight: number;
    blockedWeight: number;
}

interface PerformanceData {
    [date: string]: DailyPerformance;
}

interface StatsData {
    [date: string]: DailyStat;
}

// Minimal local settings interface for dashboard
interface LocalSettings {
    dailyBlocks?: StatsData;
    dailyPerformance?: PerformanceData;
    [key: string]: any;
}

export class DashboardManager {
    private syncSettings: AppSettings;
    private localSettings: LocalSettings;
    private blocksTodayEl: HTMLElement | null;
    private totalTrackersEl: HTMLElement | null;
    private totalAdsEl: HTMLElement | null;
    private perfGaugeArc: SVGPathElement | null;
    private perfGaugeText: SVGTextElement | null;
    private chartSvg: HTMLElement | null;

    constructor(syncSettings: AppSettings, localSettings: LocalSettings) {
        this.syncSettings = syncSettings;
        this.localSettings = localSettings;
        this.blocksTodayEl = document.getElementById('blocks-today');
        this.totalTrackersEl = document.getElementById('total-trackers');
        this.totalAdsEl = document.getElementById('total-ads');
        // NEW: Performance Elements
        this.perfGaugeArc = document.querySelector('#performance-impact .gauge-arc') as SVGPathElement;
        this.perfGaugeText = document.querySelector('#performance-impact .gauge-text') as SVGTextElement;
        this.chartSvg = document.getElementById('activity-chart');
    }

    initialize(): void {
        this.renderStats();
        this.renderPerformanceImpact();
        this.renderChart();

        // Auto-update when storage changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes.dailyBlocks) {
                    this.renderStats();
                    this.renderChart();
                }
                if (changes.dailyPerformance) {
                    this.renderPerformanceImpact();
                }
            }
        });
    }

    async renderStats(): Promise<void> {
        if (!this.blocksTodayEl || !this.totalAdsEl || !this.totalTrackersEl) return;

        const today = new Date().toISOString().slice(0, 10);
        const { dailyBlocks = {} } = await chrome.storage.local.get('dailyBlocks') as { dailyBlocks: StatsData };
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

    async renderPerformanceImpact(): Promise<void> {
        const { dailyPerformance = {} } = await chrome.storage.local.get('dailyPerformance') as { dailyPerformance: PerformanceData };
        // @ts-ignore
        const totalPerf = Object.values(dailyPerformance).reduce((acc: DailyPerformance, day: DailyPerformance) => {
            acc.totalWeight += day.totalWeight || 0;
            acc.blockedWeight += day.blockedWeight || 0;
            return acc;
        }, { totalWeight: 0, blockedWeight: 0 });

        const percentage = totalPerf.totalWeight > 0
            ? Math.round((totalPerf.blockedWeight / totalPerf.totalWeight) * 100)
            : 0;

        this.updateGauge(percentage);
    }

    updateGauge(percentage: number): void {
        if (!this.perfGaugeArc || !this.perfGaugeText) return;

        const circumference = 2 * Math.PI * 54;
        const arcLength = (percentage / 100) * circumference;

        this.perfGaugeArc.style.strokeDasharray = `${arcLength}, ${circumference}`;
        this.perfGaugeText.textContent = `${percentage}%`;
    }

    async renderChart(): Promise<void> {
        if (!this.chartSvg) return;

        const { dailyBlocks = {} } = await chrome.storage.local.get('dailyBlocks') as { dailyBlocks: StatsData };

        // Get last 7 days
        const dates: string[] = [];
        const dataPoints: number[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            dates.push(dateStr);
            const stats = dailyBlocks[dateStr] || { ads: 0, trackers: 0 };
            dataPoints.push(stats.ads + stats.trackers);
        }

        const maxVal = Math.max(...dataPoints, 10); // Min max of 10 to avoid flat line at 0
        const width = 800;
        const height = 200;
        const padding = 20;

        // Calculate points
        const points = dataPoints.map((val, index) => {
            const x = (index / (dataPoints.length - 1)) * (width - 2 * padding) + padding;
            const y = height - ((val / maxVal) * (height - 2 * padding)) - padding;
            return `${x},${y}`;
        }).join(' ');

        // Create SVG content
        // Gradient definition
        const defs = `
            <defs>
                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                </linearGradient>
            </defs>
        `;

        // Area path (closed loop)
        const firstPoint = points.split(' ')[0];
        const lastPoint = points.split(' ')[points.split(' ').length - 1];
        const areaPath = `
            <path d="M ${points} L ${lastPoint.split(',')[0]},${height} L ${firstPoint.split(',')[0]},${height} Z" 
                  fill="url(#chartGradient)" stroke="none" />
        `;

        // Line path
        const linePath = `
            <path d="M ${points}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        `;

        // Points
        const circles = dataPoints.map((val, index) => {
            const x = (index / (dataPoints.length - 1)) * (width - 2 * padding) + padding;
            const y = height - ((val / maxVal) * (height - 2 * padding)) - padding;
            return `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#3b82f6" stroke-width="2">
                        <title>${dates[index]}: ${val} blocked</title>
                    </circle>`;
        }).join('');

        this.chartSvg.innerHTML = defs + areaPath + linePath + circles;
    }
}
