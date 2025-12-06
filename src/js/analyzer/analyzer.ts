// analyzer.ts
// Fully typed TypeScript version

interface Threat {
    url: string;
    category?: string;
    reason?: string;
}

interface VisualAnnoyance {
    description: string;
    suggestedSelector: string;
}

interface HeuristicMatch {
    url: string;
    keyword: string;
}

interface DarkPattern {
    patternName: string;
    description: string;
}

interface ReportData {
    networkThreats?: Threat[];
    visualAnnoyances?: VisualAnnoyance[];
    heuristicMatches?: HeuristicMatch[];
    darkPatterns?: DarkPattern[];
}

interface GradeResult {
    letter: 'A' | 'B' | 'C' | 'D' | 'F';
    percentage: number;
}

interface GradeCounts {
    network: number;
    visual: number;
    heuristic: number;
    patterns: number;
}

// --- UI Elements ---
document.addEventListener('DOMContentLoaded', () => {
    const startScanBtn = document.getElementById('start-scan-btn') as HTMLButtonElement | null;
    const contentArea = document.getElementById('content-area') as HTMLElement | null;
    const loadingMessageEl = document.getElementById('loading-message') as HTMLElement | null;
    const pageDomainEl = document.getElementById('page-domain') as HTMLElement | null;
    const reportPageDomainEl = document.getElementById('report-page-domain') as HTMLElement | null;
    const scanStatusMessageEl = document.getElementById('scan-status-message') as HTMLElement | null;
    const applyAllBtn = document.getElementById('apply-all-fixes-btn') as HTMLButtonElement | null;

    const errorView = {
        message: document.getElementById('error-message') as HTMLElement | null,
        retryBtn: document.getElementById('retry-scan-btn') as HTMLButtonElement | null
    };

    const apiKeyMissingView = document.getElementById('api-key-missing-view') as HTMLElement | null;
    const goToSettingsBtn = document.getElementById('go-to-settings-btn') as HTMLButtonElement | null;

    if (!startScanBtn || !contentArea || !loadingMessageEl || !pageDomainEl ||
        !reportPageDomainEl || !scanStatusMessageEl || !applyAllBtn || !errorView.message ||
        !errorView.retryBtn || !apiKeyMissingView || !goToSettingsBtn) {
        console.error("ZenithGuard: Critical UI elements missing in Analyzer.");
        return;
    }

    // --- State ---
    let tabId: number | null = null;
    let pageUrl: string | null = null;
    let currentReportData: ReportData | null = null;
    let loadingInterval: number | null = null;

    const loadingMessages: string[] = [
        "Capturing page content...",
        "Optimizing network data...",
        "Consulting with Gemini AI...",
        "Parsing AI response...",
        "Finalizing suggestions..."
    ];

    // --- Core Functions ---

    async function initialize(): Promise<void> {
        const params = new URLSearchParams(window.location.search);
        const tabIdParam = params.get('tabId');
        const urlParam = params.get('url');

        if (!tabIdParam || !urlParam) {
            document.body.innerHTML = '<h1>Error: Missing tab information.</h1>';
            return;
        }

        tabId = parseInt(tabIdParam, 10);
        pageUrl = decodeURIComponent(urlParam);

        let domain = 'unknown';
        try {
            domain = new URL(pageUrl).hostname;
        } catch (e) { /* ignore invalid url */ }

        if (pageDomainEl) pageDomainEl.textContent = domain;
        if (reportPageDomainEl) reportPageDomainEl.textContent = domain;

        // --- API Key Check ---
        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey') as { geminiApiKey?: string };
        if (!geminiApiKey) {
            setViewState('api-key-missing');
            if (startScanBtn) startScanBtn.style.display = 'none';
            return;
        }

        setViewState('idle');

        const cacheKey = `ai-scan-cache-${pageUrl}`;
        const cached = await chrome.storage.local.get(cacheKey) as { [key: string]: { data: ReportData, timestamp: number } };
        const oneDay = 24 * 60 * 60 * 1000;

        if (cached[cacheKey] && (Date.now() - cached[cacheKey].timestamp < oneDay)) {
            const cacheDate = new Date(cached[cacheKey].timestamp).toLocaleString();
            if (scanStatusMessageEl) scanStatusMessageEl.textContent = `Displaying cached report from ${cacheDate}.`;
            if (startScanBtn) startScanBtn.textContent = "Re-scan Page";
            currentReportData = cached[cacheKey].data;
            renderReport(currentReportData!);
        } else {
            startScan(); // Auto-start scan if no cache is found
        }
    }

    async function startScan(): Promise<void> {
        setViewState('loading');
        if (scanStatusMessageEl) scanStatusMessageEl.textContent = "";

        if (pageUrl) {
            await chrome.storage.local.remove(`ai-scan-cache-${pageUrl}`);
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_PAGE_WITH_AI',
                data: { tabId, pageUrl }
            });

            if (response.error) {
                if (response.error === 'QUOTA_EXCEEDED') {
                    renderQuotaError();
                    return;
                }
                if (response.error === 'AI_TIMEOUT') {
                    renderError("Analysis timed out. The page might be too complex or the connection is slow.");
                    return;
                }
                throw new Error(response.error as string);
            }

            currentReportData = response.result as ReportData;
            renderReport(currentReportData!);

        } catch (error) {
            renderError((error as Error).message);
        }
    }

    // --- UI State & Rendering ---

    function setViewState(state: string): void {
        if (contentArea) contentArea.className = `state-${state}`;

        // Stop/start loading messages
        if (state === 'loading') {
            let msgIndex = 0;
            if (loadingMessageEl) loadingMessageEl.textContent = loadingMessages[0];

            if (loadingInterval) clearInterval(loadingInterval);
            loadingInterval = window.setInterval(() => {
                msgIndex = (msgIndex + 1) % loadingMessages.length;
                if (loadingMessageEl) loadingMessageEl.textContent = loadingMessages[msgIndex];
            }, 2000);
        } else {
            if (loadingInterval) {
                clearInterval(loadingInterval);
                loadingInterval = null;
            }
        }
    }

    function renderError(message: string): void {
        setViewState('error');
        if (errorView.message) errorView.message.textContent = message;
        if (startScanBtn) startScanBtn.textContent = "Re-scan Page";
    }

    function renderQuotaError(): void {
        setViewState('quota-error');
        if (startScanBtn) startScanBtn.textContent = "Re-scan Page";
    }


    function renderReport(data: ReportData): void {
        setViewState('report');
        if (startScanBtn) startScanBtn.textContent = "Re-scan Page";

        const { networkThreats = [], visualAnnoyances = [], heuristicMatches = [], darkPatterns = [] } = data;

        const summaryNetwork = document.getElementById('summary-network-threats');
        const summaryVisual = document.getElementById('summary-visual-annoyances');
        const summaryHeuristic = document.getElementById('summary-heuristic-issues');
        const summaryPatterns = document.getElementById('summary-dark-patterns');

        if (summaryNetwork) summaryNetwork.textContent = networkThreats.length.toString();
        if (summaryVisual) summaryVisual.textContent = visualAnnoyances.length.toString();
        if (summaryHeuristic) summaryHeuristic.textContent = heuristicMatches.length.toString();
        if (summaryPatterns) summaryPatterns.textContent = darkPatterns.length.toString();

        const grade = calculateGrade({
            network: networkThreats.length,
            visual: visualAnnoyances.length,
            heuristic: heuristicMatches.length,
            patterns: darkPatterns.length
        });
        renderGauge(grade.letter, grade.percentage);

        const totalFixableIssues = networkThreats.length + visualAnnoyances.length;
        if (totalFixableIssues > 0 && applyAllBtn) {
            applyAllBtn.classList.remove('hidden');
            applyAllBtn.textContent = `Apply ${totalFixableIssues} AI Fixes`;
            applyAllBtn.disabled = false;
        } else if (applyAllBtn) {
            applyAllBtn.classList.add('hidden');
        }

        renderNetworkThreats(networkThreats);
        renderVisualSuggestions(visualAnnoyances);
        renderHeuristicKeywords(heuristicMatches);
        renderDarkPatterns(darkPatterns);
    }

    function calculateGrade(counts: GradeCounts): GradeResult {
        const issueCount = counts.network + counts.visual + counts.heuristic + (counts.patterns * 5);

        if (issueCount === 0) return { letter: 'A', percentage: 100 };
        if (issueCount <= 2) return { letter: 'B', percentage: 85 };
        if (issueCount <= 5) return { letter: 'C', percentage: 70 };
        if (issueCount <= 10) return { letter: 'D', percentage: 55 };
        return { letter: 'F', percentage: 40 };
    }

    function renderGauge(letter: string, percentage: number): void {
        const arc = document.querySelector('.gauge-arc') as SVGElement | null;
        const text = document.querySelector('.gauge-text') as SVGElement | null;
        const circumference = 2 * Math.PI * 54;
        const arcLength = (percentage / 100) * circumference;

        if (arc) arc.style.strokeDasharray = `${arcLength}, ${circumference}`;
        if (text) text.textContent = letter;
    }

    function renderNetworkThreats(threats: Threat[]): void {
        const container = document.getElementById('network-threats-content');
        if (!container) return;

        if (!threats || threats.length === 0) {
            container.innerHTML = `<p class="no-results-message">No network threats detected.</p>`;
            return;
        }
        const grouped = threats.reduce((acc, threat) => {
            const category = threat.category || 'General';
            if (!acc[category]) acc[category] = [];
            acc[category].push(threat);
            return acc;
        }, {} as Record<string, Threat[]>);

        container.innerHTML = Object.entries(grouped).map(([category, items]) => `
            <div class="threat-category">
                <h3 class="category-header" style="border-color: ${category === 'Ads' ? '#ef4444' : '#f97316'};">${category}</h3>
                ${items.map(threat => `
                    <div class="threat-entry">
                        <div class="threat-url">${escapeHtml(threat.url)}</div>
                        <div class="threat-reason">${escapeHtml(threat.reason || '')}</div>
                        <div class="threat-actions">
                            <button class="threat-action-btn" data-ruletype="networkBlocklist" data-value="${new URL(threat.url).hostname}">Block Domain</button>
                        </div>
                    </div>`).join('')}
            </div>`).join('');
    }

    function renderVisualSuggestions(suggestions: VisualAnnoyance[]): void {
        const container = document.getElementById('visual-suggestions-content');
        if (!container) return;

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

    function renderHeuristicKeywords(matches: HeuristicMatch[]): void {
        const container = document.getElementById('heuristic-keywords-content');
        if (!container) return;

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

    function renderDarkPatterns(patterns: DarkPattern[]): void {
        const container = document.getElementById('dark-patterns-content');
        if (!container) return;

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
    if (applyAllBtn) {
        applyAllBtn.addEventListener('click', async () => {
            if (!currentReportData || !pageUrl) return;
            applyAllBtn.disabled = true;
            applyAllBtn.textContent = 'Applying...';

            const { networkThreats = [], visualAnnoyances = [] } = currentReportData;
            let domain = 'unknown';
            try {
                domain = new URL(pageUrl).hostname;
            } catch (e) { }

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

            document.querySelectorAll<HTMLButtonElement>('.threat-action-btn, .suggestion-add-btn').forEach(btn => {
                if (btn.dataset.ruletype && ['networkBlocklist', 'customHidingRules'].includes(btn.dataset.ruletype)) {
                    btn.textContent = 'Added!';
                    btn.classList.add('added');
                    btn.disabled = true;
                }
            });
        });
    }

    document.body.addEventListener('click', async (e) => {
        const button = e.target as HTMLButtonElement;

        // Handle Action Buttons
        if (button.dataset && button.dataset.ruletype && button.dataset.value && !button.disabled) {
            const ruletype = button.dataset.ruletype;
            const value = button.dataset.value;

            const storageData = await chrome.storage.sync.get(ruletype) as Record<string, any>;
            let storageRules = storageData[ruletype] || (ruletype === 'customHidingRules' ? {} : []);

            let alreadyExists = false;

            if (ruletype === 'customHidingRules') {
                let domain = 'unknown';
                if (pageUrl) {
                    try { domain = new URL(pageUrl).hostname; } catch (e) { }
                }

                if (!storageRules[domain]) storageRules[domain] = [];
                alreadyExists = storageRules[domain].some((r: any) => r.value === value);
                if (!alreadyExists) storageRules[domain].push({ value: value, enabled: true });
            } else {
                alreadyExists = storageRules.some((r: any) => r.value === value);
                if (!alreadyExists) storageRules.push({ value: value, enabled: true });
            }

            if (!alreadyExists) {
                await chrome.storage.sync.set({ [ruletype]: storageRules });
                button.textContent = 'Added!';
                button.classList.add('added');
                button.disabled = true;
            }
        }

        // Handle Preview Buttons
        if (button.classList.contains('suggestion-preview-btn')) {
            const isActive = button.classList.toggle('active');
            document.querySelectorAll('.suggestion-preview-btn.active').forEach(btn => {
                if (btn !== button) btn.classList.remove('active');
            });
            const selector = button.dataset.selector;
            if (tabId && selector) {
                chrome.tabs.sendMessage(tabId, { type: isActive ? 'PREVIEW_ELEMENT' : 'CLEAR_PREVIEW', selector }).catch(() => { });
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'CLEAR_PREVIEW' }).catch(() => { });
        }
    });

    function escapeHtml(unsafe: string): string {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    if (startScanBtn) startScanBtn.addEventListener('click', startScan);
    if (errorView.retryBtn) errorView.retryBtn.addEventListener('click', startScan);
    if (goToSettingsBtn) goToSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

    initialize();
});