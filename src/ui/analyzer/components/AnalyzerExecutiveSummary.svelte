<script lang="ts">
    import type { AnalyzerReport } from "../types";

    export let report: AnalyzerReport;

    function getGaugeOffset(grade: string): number {
        switch (grade) {
            case "A":
                return 40;
            case "B":
                return 120;
            case "C":
                return 220;
            default:
                return 320;
        }
    }
</script>

<div class="executive-summary">
    <div class="mini-section-label">Executive View</div>
    <div class="summary-pill">{report.gradeLabel}</div>
    <h2>Executive Summary</h2>
    <p>{report.executiveSummary}</p>
    <div class="observed-window-meta">
        <span class="observed-window-kicker">Observed traffic</span>
        <p>{report.observedWindow.sessionScope}</p>
        {#if report.observedWindow.lastUpdatedAtLabel}
            <span class="observed-window-last-updated">Last request at {report.observedWindow.lastUpdatedAtLabel}</span>
        {/if}
    </div>
    <div class="executive-stats">
        <div class="executive-stat"><span class="executive-stat-label">Total findings</span><strong>{report.counts.networkThreats + report.counts.visualAnnoyances + report.counts.heuristicIssues + report.counts.darkPatterns}</strong></div>
        <div class="executive-stat"><span class="executive-stat-label">Grade</span><strong>{report.grade}</strong></div>
        <div class="executive-stat"><span class="executive-stat-label">Needs action</span><strong>{report.needsAction.needsAction}</strong></div>
        <div class="executive-stat"><span class="executive-stat-label">Blocked traffic</span><strong>{report.observedCounts.blocked}</strong></div>
        <div class="executive-stat"><span class="executive-stat-label">Seen only</span><strong>{report.observedCounts.seen}</strong></div>
    </div>
</div>

<div class="summary-header">
    <div class="privacy-grade-container">
        <svg width="160" height="160" viewBox="0 0 160 160">
            <circle class="gauge-background" cx="80" cy="80" r="70" stroke-width="12"></circle>
            <circle
                class="gauge-arc"
                cx="80"
                cy="80"
                r="70"
                stroke-width="12"
                stroke-dasharray="440"
                stroke-dashoffset={getGaugeOffset(report.grade)}
                transform="rotate(-90 80 80)"
            ></circle>
            <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" class="gauge-text">{report.grade}</text>
        </svg>
        <p class="privacy-grade-label">Privacy Grade</p>
    </div>

    <div class="summary-details">
        <div class="mini-section-label">Breakdown</div>
        <div class="summary-grid">
            <div class="summary-card"><div class="summary-title">Network Threats</div><div class="summary-value tone-danger">{report.counts.networkThreats}</div></div>
            <div class="summary-card"><div class="summary-title">Visual Annoyances</div><div class="summary-value tone-warning">{report.counts.visualAnnoyances}</div></div>
            <div class="summary-card"><div class="summary-title">Heuristic Issues</div><div class="summary-value tone-info">{report.counts.heuristicIssues}</div></div>
            <div class="summary-card"><div class="summary-title">Dark Patterns</div><div class="summary-value tone-accent">{report.counts.darkPatterns}</div></div>
        </div>
    </div>
</div>
