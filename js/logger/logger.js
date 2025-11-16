// logger.js
import { showToast } from '../utils/toast.js';

document.addEventListener('DOMContentLoaded', () => {
    const tabTitleEl = document.getElementById('tab-title');
    const logBody = document.getElementById('log-body');
    const filterInput = document.getElementById('filter-input');
    const filterButtons = document.querySelectorAll('.filter-buttons button');
    const clearLogBtn = document.getElementById('clear-log-btn');

    let tabId;
    let currentFilter = 'all';
    let currentSearchQuery = '';
    let fullLog = [];

    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        tabId = parseInt(params.get('tabId'));
        if (!tabId) {
            tabTitleEl.textContent = 'Invalid Tab ID';
            return;
        }

        const tab = await chrome.tabs.get(tabId);
        tabTitleEl.textContent = tab.title || tab.url;

        // Initial load
        fullLog = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG', tabId: tabId });
        renderLog();
    }

    function renderLog() {
        logBody.innerHTML = '';
        const filteredLog = fullLog.filter(entry => {
            const matchesFilter = currentFilter === 'all' || entry.status === currentFilter;
            const matchesSearch = !currentSearchQuery || entry.url.toLowerCase().includes(currentSearchQuery);
            return matchesFilter && matchesSearch;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort by newest first

        if (filteredLog.length === 0) {
            logBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #9ca3af;">No requests to display.</td></tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        filteredLog.forEach(entry => {
            const tr = document.createElement('tr');
            const statusClass = entry.status === 'blocked' ? 'blocked' : 'allowed';
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const domain = new URL(entry.url).hostname;
            
            const actionsCell = entry.status === 'allowed' 
                ? `<button class="block-btn" data-domain="${escapeHtml(domain)}">Block</button>`
                : '';
            
            const sourceCell = entry.matchedRuleInfo
                ? `<span class="source-badge">${escapeHtml(entry.matchedRuleInfo.source)}</span>`
                : '';

            tr.innerHTML = `
                <td class="time">${time}</td>
                <td class="status"><span class="status-badge ${statusClass}">${entry.status.toUpperCase()}</span></td>
                <td class="url" title="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</td>
                <td class="source">${sourceCell}</td>
                <td class="type">${escapeHtml(entry.type)}</td>
                <td class="initiator" title="${escapeHtml(entry.initiator)}">${escapeHtml(entry.initiator || 'N/A')}</td>
                <td class="actions">${actionsCell}</td>
            `;
            fragment.appendChild(tr);
        });
        logBody.appendChild(fragment);
    }

    // --- Event Listeners ---
    filterInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.toLowerCase();
        renderLog();
    });

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentFilter = button.dataset.filter;
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            renderLog();
        });
    });

    clearLogBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_NETWORK_LOG', tabId });
        fullLog = [];
        renderLog();
    });

    logBody.addEventListener('click', async (e) => {
        const button = e.target.closest('.block-btn');
        if (button && !button.disabled) {
            const domainToBlock = button.dataset.domain;
            button.textContent = 'Blocking...';
            button.disabled = true;

            const response = await chrome.runtime.sendMessage({
                type: 'ADD_TO_NETWORK_BLOCKLIST',
                domain: domainToBlock
            });
            
            if (response.success) {
                button.textContent = 'Blocked!';
                showToast({ message: `Domain ${domainToBlock} blocked. Reload the page to see the full effect.` });
            } else {
                button.textContent = 'Error';
                showToast({ message: `Failed to block ${domainToBlock}.`, type: 'error' });
            }
        }
    });

    // --- Helper Functions ---
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    initialize();
});
