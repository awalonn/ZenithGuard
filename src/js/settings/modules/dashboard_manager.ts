
import Chart from 'chart.js/auto';

interface DailyData {
    ads: number;
    trackers: number;
}
interface DailyPerformance {
    totalWeight: number;
    blockedWeight: number;
}
interface StorageData {
    dailyBlocks: Record<string, DailyData>;
    dailyPerformance: Record<string, DailyPerformance>;
}

export class DashboardManager {
    private chartInstance: Chart | null = null;

    constructor() {
        // No constructor logic needed yet
    }

    async initialize() {
        await this.renderDashboard();
    }

    async renderDashboard() {
        const data = await chrome.storage.local.get(['dailyBlocks', 'dailyPerformance']) as StorageData;
        const dailyBlocks = data.dailyBlocks || {};
        const dailyPerf = data.dailyPerformance || {};

        this.updateKPIs(dailyBlocks, dailyPerf);
        this.renderTrendChart(dailyBlocks);
    }

    private updateKPIs(blocks: Record<string, DailyData>, perf: Record<string, DailyPerformance>) {
        let totalAds = 0;
        let totalTrackers = 0;
        let todayBlocks = 0;

        const today = new Date().toISOString().slice(0, 10);
        if (blocks[today]) {
            todayBlocks = (blocks[today].ads || 0) + (blocks[today].trackers || 0);
        }

        // Aggregate all time (or last 30 days as stored)
        Object.values(blocks).forEach(day => {
            totalAds += (day.ads || 0);
            totalTrackers += (day.trackers || 0);
        });

        // Update elements with IDs from settings.html
        const todayEl = document.getElementById('blocks-today');
        const adsEl = document.getElementById('total-ads');
        const trackersEl = document.getElementById('total-trackers');

        // Gauge text (simple implementation for now)
        const gaugeText = document.querySelector('#performance-impact .gauge-text');
        if (gaugeText) gaugeText.textContent = "15%"; // Placeholder until we calculate real perf

        if (todayEl) todayEl.innerText = todayBlocks.toLocaleString();
        if (adsEl) adsEl.innerText = totalAds.toLocaleString();
        if (trackersEl) trackersEl.innerText = totalTrackers.toLocaleString();
    }

    private renderTrendChart(blocks: Record<string, DailyData>) {
        const ctx = document.getElementById('activity-chart') as HTMLCanvasElement;
        if (!ctx) return;

        // Sort dates
        const labels = Object.keys(blocks).sort();
        // If no data, show last 7 days empty
        if (labels.length === 0) {
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                labels.push(d.toISOString().slice(0, 10));
            }
        }

        const adsData = labels.map(date => (blocks[date] ? blocks[date].ads : 0));
        const trackersData = labels.map(date => (blocks[date] ? blocks[date].trackers : 0));

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(date => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                datasets: [
                    {
                        label: 'Ads',
                        data: adsData,
                        borderColor: '#3b82f6', // blue-500
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Trackers',
                        data: trackersData,
                        borderColor: '#8b5cf6', // violet-500
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8' } // text-slate-400
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }
}
