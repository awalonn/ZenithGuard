// analyzer.js - REFACTORED

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const startScanBtn = document.getElementById('start-scan-btn');
    const contentArea = document.getElementById('content-area');
    const loadingMessageEl = document.getElementById('loading-message');
    const pageDomainEl = document.getElementById('page-domain');
    const reportPageDomainEl = document.getElementById('report-page-domain');
    const scanStatusMessageEl = document.getElementById('scan-status-message');
    const applyAllBtn = document.getElementById('apply-all-fixes-btn');
    const errorView = {
        message: document.getElementById('error-message'),
        retryBtn: document.getElementById('retry-scan-btn')
    };
    // NEW: API Key Missing View
    const apiKeyMissingView = document.getElementById('api-key-missing-view');
    const goToSettingsBtn = document.getElementById('go-to-settings-btn');


    // --- State ---
    let tabId, pageUrl;
    let currentReportData = null;
    let loadingInterval = null;

    const loadingMessages = [
        "Capturing page content...",
        "Optimizing network data...",
        "Consulting with Gemini AI...",
        "Parsing AI response...",
        "Finalizing suggestions..."
    ];

    // --- Core Functions ---

    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        tabId = parseInt(params.get('tabId'));
        pageUrl = decodeURIComponent(params.get('url'));

        if (!tabId || !pageUrl) {
            document.body.innerHTML = '<h1>Error: Missing tab information.</h1>';
            return;
        }

        const domain = new URL(pageUrl).hostname;
        pageDomainEl.textContent = domain;
        reportPageDomainEl.textContent = domain;
        
        // --- NEW: API Key Check ---
        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
        if (!geminiApiKey) {
            setViewState('api-key-missing');
            startScanBtn.style.display = 'none'; // Hide scan button
            return;
        }
        // --- End Key Check ---

        setViewState('idle');
        
        const cacheKey = `ai-scan-cache-${pageUrl}`;
        const cached = await chrome.storage.local.get(cacheKey);
        const oneDay = 24 * 60 * 60 * 1000;

        if (cached[cacheKey] && (Date.now() - cached[cacheKey].timestamp < oneDay)) {
            const cacheDate = new Date(cached[cacheKey].timestamp).toLocaleString();
            scanStatusMessageEl.textContent = `Displaying cached report from ${cacheDate}.`;
            startScanBtn.textContent = "Re-scan Page";
            currentReportData = cached[cacheKey].data;
            renderReport(currentReportData);
        } else {
            startScan(); // Auto-start scan if no cache is found
        }
    }

    async function startScan() {
        setViewState('loading');
        scanStatusMessageEl.textContent = "";

        // Clear any old cache before starting a new scan
        await chrome.storage.local.remove(`ai-scan-cache-${pageUrl}`);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_PAGE_WITH_AI',
                data: { tabId, pageUrl }
            });

            if (response.error) {
                // NEW: Handle specific quota error
                if (response.error === 'QUOTA_EXCEEDED') {
                    renderQuotaError();
                    return;
                }
                throw new Error(response.error);
            }

            currentReportData = response.result;
            renderReport(currentReportData);

        } catch (error) {
            renderError(error.message);
        }
    }
    
    // --- UI State & Rendering ---

    function setViewState(state) {
        contentArea.className = `state-${state}`;
        
        // Stop/start loading messages
        if (state === 'loading') {
            let msgIndex = 0;
            loadingMessageEl.textContent = loadingMessages[0];
            loadingInterval = setInterval(() => {
                msgIndex = (msgIndex + 1) % loadingMessages.length;
                loadingMessageEl.textContent = loadingMessages[msgIndex];
            }, 2000);
        } else {
            clearInterval(loadingInterval);
        }
    }
    
    function renderError(message) {
        setViewState('error');
        errorView.message.textContent = message;
        startScanBtn.textContent = "Re-scan Page";
    }

    function renderQuotaError() {
        setViewState('quota-error');
        startScanBtn.textContent = "Re-scan Page";
    }


    function renderReport(data) {
        setViewState('report');
        startScanBtn.textContent = "Re-scan Page";

        const { networkThreats = [], visualAnnoyances = [], heuristicMatches = [], darkPatterns = [] } = data;

        document.getElementById('summary-network-threats').textContent = networkThreats.length;
        document.getElementById('summary-visual-annoyances').textContent = visualAnnoyances.length;
        document.getElementById('summary-heuristic-issues').textContent = heuristicMatches.length;
        document.getElementById('summary-dark-patterns').textContent = darkPatterns.length; // NEW
        
        const grade = calculateGrade({
            network: networkThreats.length,
            visual: visualAnnoyances.length,
            heuristic: heuristicMatches.length,
            patterns: darkPatterns.length
        });
        renderGauge(grade.letter, grade.percentage);

        const totalFixableIssues = networkThreats.length + visualAnnoyances.length;
        if (totalFixableIssues > 0) {
            applyAllBtn.classList.remove('hidden');
            applyAllBtn.textContent = `Apply ${totalFixableIssues} AI Fixes`;
            applyAllBtn.disabled = false;
        } else {
            applyAllBtn.classList.add('hidden');
        }

        renderNetworkThreats(networkThreats);
        renderVisualSuggestions(visualAnnoyances);
        renderHeuristicKeywords(heuristicMatches);
        renderDarkPatterns(darkPatterns); // NEW
    }

    function calculateGrade(counts) {
        // Each dark pattern counts as 5 issues due to their deceptive nature.
        const issueCount = counts.network + counts.visual + counts.heuristic + (counts.patterns * 5);

        if (issueCount === 0) return { letter: 'A', percentage: 100 };
        if (issueCount <= 2) return { letter: 'B', percentage: 85 };
        if (issueCount <= 5) return { letter: 'C', percentage: 70 };
        if (issueCount <= 10) return { letter: 'D', percentage: 55 };
        return { letter: 'F', percentage: 40 };
    }

    function renderGauge(letter, percentage) {
        const arc = document.querySelector('.gauge-arc');
        const text = document.querySelector('.gauge-text');
        const circumference = 2 * Math.PI * 54;
        const arcLength = (percentage / 100) * circumference;
        
        arc.style.strokeDasharray = `${arcLength}, ${circumference}`;
        text.textContent = letter;
    }

    function renderNetworkThreats(threats) {
        const container = document.getElementById('network-threats-content');
        if (!threats || threats.length === 0) {
            container.innerHTML = `<p class="no-results-message">No network threats detected.</p>`;
            return;
        }
        const grouped = threats.reduce((acc, threat) => {
            const category = threat.category || 'General';
            if (!acc[category]) acc[category] = [];
            acc[category].push(threat);
            return acc;
        }, {});
        container.innerHTML = Object.entries(grouped).map(([category, items]) => `
            <div class="threat-category">
                <h3 class="category-header" style="border-color: ${category === 'Ads' ? '#ef4444' : '#f97316'};">${category}</h3>
                ${items.map(threat => `
                    <div class="threat-entry">
                        <div class="threat-url">${escapeHtml(threat.url)}</div>
                        <div class="threat-reason">${escapeHtml(threat.reason)}</div>
                        <div class="threat-actions">
                            <button class="threat-action-btn" data-ruletype="networkBlocklist" data-value="${new URL(threat.url).hostname}">Block Domain</button>
                        </div>
                    </div>`).join('')}
            </div>`).join('');
    }

    function renderVisualSuggestions(suggestions) {
        const container = document.getElementById('visual-suggestions-content');
        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = `<p class="no-results-message">No visual annoyances suggested.</p>`;
            return;
        }
        container.innerHTML = suggestions.map(s => `
            <div class="suggestion-card">
                <div>
                    <p class="suggestion-description">${escapeHtml(s.description)}</p>
                    <code class="suggestion-selector">${escapeHtml(s.suggestedSelector)}</code>
                </div>
                <div class="suggestion-actions">
                    <button class="suggestion-preview-btn" data-selector="${escapeHtml(s.suggestedSelector)}">Preview</button>
                    <button class="suggestion-add-btn" data-ruletype="customHidingRules" data-value="${escapeHtml(s.suggestedSelector)}">Add Rule</button>
                </div>
            </div>`).join('');
    }

    function renderHeuristicKeywords(matches) {
        const container = document.getElementById('heuristic-keywords-content');
         if (!matches || matches.length === 0) {
            container.innerHTML = `<p class="no-results-message">No heuristic keyword matches found.</p>`;
            return;
        }
        container.innerHTML = matches.map(m => `
             <div class="threat-entry">
                <div class="threat-url">${escapeHtml(m.url)}</div>
                <div class="threat-reason">Matched keyword: <code>${escapeHtml(m.keyword)}</code></div>
                 <div class="threat-actions">
                    <button class="threat-action-btn" data-ruletype="heuristicKeywords" data-value="${escapeHtml(m.keyword)}">Add to Engine</button>
                </div>
            </div>`).join('');
    }

    // NEW: Function to render dark patterns
    function renderDarkPatterns(patterns) {
        const container = document.getElementById('dark-patterns-content');
        if (!patterns || patterns.length === 0) {
            container.innerHTML = `<p class="no-results-message">No deceptive UI patterns detected.</p>`;
            return;
        }
        container.innerHTML = patterns.map(p => `
            <div class="pattern-card">
                <p class="pattern-name">${escapeHtml(p.patternName)}</p>
                <p class="pattern-description">${escapeHtml(p.description)}</p>
            </div>`).join('');
    }


    // --- Action Button Listeners ---
    applyAllBtn.addEventListener('click', async () => {
        if (!currentReportData) return;
        applyAllBtn.disabled = true;
        applyAllBtn.textContent = 'Applying...';
        const { networkThreats = [], visualAnnoyances = [] } = currentReportData;
        const domain = new URL(pageUrl).hostname;
        const newNetworkRules = networkThreats.map(threat => new URL(threat.url).hostname);
        const newHidingRules = visualAnnoyances.map(annoyance => annoyance.suggestedSelector);
        await chrome.runtime.sendMessage({
            type: 'BULK_ADD_RULES',
            data: {
                networkBlocklist: [...new Set(newNetworkRules)],
                customHidingRules: { domain, selectors: [...new Set(newHidingRules)] }
            }
        });
        applyAllBtn.textContent = 'Fixes Applied!';
        document.querySelectorAll('.threat-action-btn, .suggestion-add-btn').forEach(btn => {
            if (['networkBlocklist', 'customHidingRules'].includes(btn.dataset.ruletype)) {
                btn.textContent = 'Added!';
                btn.classList.add('added');
                btn.disabled = true;
            }
        });
    });
    
    document.body.addEventListener('click', async (e) => {
        const button = e.target;
        const { ruletype, value, selector } = button.dataset;

        if (ruletype && value && !button.disabled) {
            const { [ruletype]: storageRules = (ruletype === 'customHidingRules' ? {} : []) } = await chrome.storage.sync.get(ruletype);
            let alreadyExists = false;
            if (ruletype === 'customHidingRules') {
                const domain = new URL(pageUrl).hostname;
                if (!storageRules[domain]) storageRules[domain] = [];
                alreadyExists = storageRules[domain].some(r => r.value === value);
                if (!alreadyExists) storageRules[domain].push({ value: value, enabled: true });
            } else {
                alreadyExists = storageRules.some(r => r.value === value);
                if (!alreadyExists) storageRules.push({ value: value, enabled: true });
            }
            if (!alreadyExists) {
                await chrome.storage.sync.set({ [ruletype]: storageRules });
                button.textContent = 'Added!';
                button.classList.add('added');
                button.disabled = true;
            }
        }
        
        if (button.classList.contains('suggestion-preview-btn')) {
            const isActive = button.classList.toggle('active');
            document.querySelectorAll('.suggestion-preview-btn.active').forEach(btn => {
                if (btn !== button) btn.classList.remove('active');
            });
            chrome.tabs.sendMessage(tabId, { type: isActive ? 'PREVIEW_ELEMENT' : 'CLEAR_PREVIEW', selector }).catch(() => {});
        }
    });
    
    window.addEventListener('beforeunload', () => {
        chrome.tabs.sendMessage(tabId, { type: 'CLEAR_PREVIEW' }).catch(() => {});
    });

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    startScanBtn.addEventListener('click', startScan);
    errorView.retryBtn.addEventListener('click', startScan);
    goToSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage()); // NEW
    initialize();
});