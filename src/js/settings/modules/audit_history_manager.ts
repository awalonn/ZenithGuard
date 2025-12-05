// js/settings/modules/audit_history_manager.ts

interface AuditEntry {
    domain: string;
    url: string;
    date: number;
    grade: string;
    threatCount: number;
}

export class AuditHistoryManager {
    private history: AuditEntry[];
    private showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    private tbody: HTMLElement | null;
    private clearBtn: HTMLElement | null;

    constructor(localSettings: { auditHistory?: AuditEntry[] }, showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
        this.history = localSettings.auditHistory || [];
        this.showToast = showToast;
        this.tbody = document.getElementById('audit-history-tbody');
        this.clearBtn = document.getElementById('clear-history-btn');
    }

    initialize(): void {
        this.render();
        this.attachEventListeners();
    }

    render(): void {
        if (!this.tbody) {
            console.error('Audit history table body not found!');
            return;
        }
        this.tbody.innerHTML = '';

        if (this.history.length === 0) {
            this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No scan history found.</td></tr>`;
            return;
        }

        // Descending date order (newest first)
        const sortedHistory = [...this.history].sort((a, b) => b.date - a.date);

        sortedHistory.forEach(item => {
            const tr = document.createElement('tr');
            const gradeClass = `grade-${item.grade.toLowerCase()}`;
            const analyzerUrl = chrome.runtime.getURL(`src/pages/analyzer.html?tabId=-1&url=${encodeURIComponent(item.url)}`);
            tr.innerHTML = `
                <td>${item.domain}</td>
                <td>${new Date(item.date).toLocaleString()}</td>
                <td><span class="grade-badge ${gradeClass}">${item.grade}</span></td>
                <td>${item.threatCount}</td>
                <td><button class="btn btn-primary re-run-btn" data-url="${analyzerUrl}">Re-run</button></td>
            `;
            this.tbody!.appendChild(tr);
        });
    }

    attachEventListeners(): void {
        if (!this.clearBtn || !this.tbody) return;

        this.clearBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to clear the entire audit history? This cannot be undone.")) {
                await chrome.storage.local.set({ auditHistory: [] });
                this.history = []; // Update local state
                this.showToast('Audit history cleared!', 'success');
                this.render(); // Re-render
            }
        });

        this.tbody.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('re-run-btn')) {
                chrome.tabs.create({ url: target.dataset.url });
            }
        });

        // Listen for storage changes to auto-update the table
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.auditHistory) {
                const change = changes.auditHistory as unknown as { newValue?: AuditEntry[] };
                this.history = change.newValue || [];
                this.render();
            }
        });
    }
}