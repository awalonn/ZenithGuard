// js/settings/modules/audit_history_manager.js
export class AuditHistoryManager {
    constructor(localSettings, showToast) {
        this.history = localSettings.auditHistory || [];
        this.showToast = showToast;
        this.tbody = document.getElementById('audit-history-tbody');
        this.clearBtn = document.getElementById('clear-history-btn');
    }

    initialize() {
        this.render();
        this.attachEventListeners();
    }
    
    render() {
        if (!this.tbody) {
            console.error('Audit history table body not found!');
            return;
        }
        this.tbody.innerHTML = '';

        if (this.history.length === 0) {
            this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">No scan history found.</td></tr>`;
            return;
        }

        this.history.forEach(item => {
            const tr = document.createElement('tr');
            const gradeClass = `grade-${item.grade.toLowerCase()}`;
            const analyzerUrl = chrome.runtime.getURL(`pages/analyzer.html?tabId=-1&url=${encodeURIComponent(item.url)}`);
            tr.innerHTML = `
                <td>${item.domain}</td>
                <td>${new Date(item.date).toLocaleString()}</td>
                <td><span class="grade-badge ${gradeClass}">${item.grade}</span></td>
                <td>${item.threatCount}</td>
                <td><button class="btn btn-primary re-run-btn" data-url="${analyzerUrl}">Re-run</button></td>
            `;
            this.tbody.appendChild(tr);
        });
    }
    
    attachEventListeners() {
        if (!this.clearBtn || !this.tbody) return;
        
        this.clearBtn.addEventListener('click', async () => {
            if (confirm("Are you sure you want to clear the entire audit history? This cannot be undone.")) {
                await chrome.storage.local.set({ auditHistory: [] });
                this.history = []; // Update local state
                this.showToast('Audit history cleared!', 'success');
                this.render(); // Re-render
            }
        });
        
        this.tbody.addEventListener('click', (e) => {
            if (e.target.classList.contains('re-run-btn')) {
                chrome.tabs.create({ url: e.target.dataset.url });
            }
        });
    }
}