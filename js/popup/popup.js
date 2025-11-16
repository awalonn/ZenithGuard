// popup.js
import { showToast } from '../utils/toast.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Elements ---
    const powerBtn = document.getElementById('power-btn');
    const powerIconEnabled = document.getElementById('power-icon-enabled');
    const powerIconDisabled = document.getElementById('power-icon-disabled');
    const siteHostnameEl = document.getElementById('site-hostname');
    const privacyGradeBadge = document.getElementById('privacy-grade-badge');
    const briefingContentEl = document.getElementById('briefing-content');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const openSettingsBtn = document.getElementById('open-settings-btn');
    const openInspectorBtn = document.getElementById('open-inspector-btn');
    const isolationModeBtn = document.getElementById('isolation-mode-btn');
    const forgetfulBrowsingBtn = document.getElementById('forgetful-browsing-btn');
    const pauseBtn = document.getElementById('pause-protection-btn');
    const zapperModeBtn = document.getElementById('zapper-mode-btn');
    const defeatWallBtn = document.getElementById('defeat-wall-btn'); // NEW

    // Paused state UI
    const normalView = document.getElementById('normal-view');
    const pausedView = document.getElementById('paused-view');
    const resumeBtn = document.getElementById('resume-btn');
    const pauseTimerEl = document.getElementById('pause-timer');

    // --- State ---
    let currentTab;
    let currentHostname;
    let isSiteDisabled = false;
    let pauseInterval = null;
    
    // --- SVG Icons for Insights ---
    const ICONS = {
        record: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" /></svg>',
        database: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,3C7.58,3 4,4.79 4,7V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V7C20,4.79 16.42,3 12,3M18,7C18,7.42 17.3,7.8 16.47,8.08C15.65,8.37 14.56,8.59 13.22,8.72C13.54,8.22 13.78,7.65 13.91,7.03C15.3,6.72 16.88,6.83 18,7M12,5C14.76,5 17.27,5.84 18.5,6.86C18.17,10.05 15.61,12.38 12.5,12.47C12.33,12.47 12.17,12.47 12,12.47C8.5,12.47 5.6,9.82 5.5,6.5C6.83,5.73 9.24,5 12,5M6,8.09C6.83,7.81 7.92,7.6 9.25,7.46C8.94,8 8.7,8.59 8.58,9.21C7.22,9.08 6.1,8.87 5.5,8.5C5.7,8.37 5.85,8.23 6,8.09M6,17C6,16.58 6.7,16.2 7.53,15.92C8.35,15.63 9.44,15.41 10.78,15.28C10.46,15.78 10.22,16.35 10.09,16.97C8.7,17.28 7.12,17.17 6,17M12,19C9.24,19 6.73,18.16 5.5,17.14C5.83,13.95 8.39,11.62 11.5,11.53C11.67,11.53 11.83,11.53 12,11.53C15.5,11.53 18.4,14.18 18.5,17.5C17.17,18.27 14.76,19 12,19Z" /></svg>',
        megaphone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3.26L10 7.26V3.26H8V7.26L4 3.26L2.6 4.67L6.6 8.67H2V10.67H6.6L2.6 14.67L4 16.08L8 12.08V16.08H10V12.08L14 16.08L15.4 14.67L11.4 10.67H22V8.67H11.4L15.4 4.67L14 3.26Z" /></svg>',
        shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" /></svg>'
    };

    // --- Initialization ---
    async function initialize() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];
        
        if (!currentTab || !currentTab.url || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('file://')) {
            renderUnsupportedPage();
            return;
        }

        const { protectionPausedUntil } = await chrome.storage.session.get('protectionPausedUntil');
        if (protectionPausedUntil && protectionPausedUntil > Date.now()) {
            showPausedView(protectionPausedUntil);
            return;
        }

        // Lazy-inject policy finder on popup open
        try {
            await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['js/content/policy_finder.js']
            });
        } catch (e) {
            console.warn("ZenithGuard: Could not inject policy finder.", e);
        }

        currentHostname = new URL(currentTab.url).hostname;
        siteHostnameEl.textContent = currentHostname;

        // Load all data in parallel
        await Promise.all([
            loadPowerButtonState(),
            loadAIBriefing(),
            loadPrivacyInsights(),
            loadActivityLog(),
            loadCustomRules(),
            loadCookies(),
            loadIsolationModeState(),
            loadForgetfulBrowsingState()
        ]);

        attachEventListeners();
    }
    
    // --- Unsupported Page Renderer ---
    function renderUnsupportedPage() {
        const root = document.getElementById('app-root') || document.body;
        root.innerHTML = `
            <div class="zg-unsupported" style="padding: 20px; text-align: center; color: var(--text-secondary);">
                ZenithGuard can’t run on this page (browser settings / internal pages).
            </div>
        `;
        document.body.style.width = '300px';
    }


    // --- Data Loading & Rendering ---

    async function loadPowerButtonState() {
        const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
        isSiteDisabled = disabledSites.includes(currentHostname);
        updatePowerButtonUI();
    }

    async function loadAIBriefing() {
        briefingContentEl.innerHTML = '<div class="briefing-loading">Checking for insights...</div>';
        
        const summaryCacheKey = `privacy-summary-${currentHostname}`;
        const policyUrlKey = `privacy-policy-url-${currentHostname}`;
        const { auditHistory = [], ...storageData } = await chrome.storage.local.get(['auditHistory', summaryCacheKey, policyUrlKey]);
        
        // 1. Update AI Scan Grade Badge
        const lastScan = auditHistory.find(item => item.domain === currentHostname);
        const analyzerUrl = chrome.runtime.getURL(`pages/analyzer.html?tabId=${currentTab.id}&url=${encodeURIComponent(currentTab.url)}`);
        
        privacyGradeBadge.href = analyzerUrl;
        if (lastScan) {
            privacyGradeBadge.textContent = lastScan.grade;
            privacyGradeBadge.className = `grade-badge grade-${lastScan.grade.toLowerCase()}`;
        } else {
            privacyGradeBadge.textContent = 'Scan';
            privacyGradeBadge.className = 'grade-badge grade-none';
        }

        // 2. Render Privacy Policy Summary or CTA (NEW FLOW)
        const summaryData = storageData[summaryCacheKey];
        const policyUrl = storageData[policyUrlKey];

        if (summaryData) { // A summary (or error) is cached
            if (summaryData.error) {
                 const errorMessage = summaryData.error.includes('QUOTA')
                    ? "AI analysis quota exceeded."
                    : "Failed to analyze privacy policy.";
                briefingContentEl.innerHTML = `<div class="briefing-error">${escapeHtml(errorMessage)}</div>`;
            } else {
                renderBriefing(summaryData.summary);
            }
        } else if (policyUrl) { // No summary, but a policy URL was found
            // QUOTA SAVING: Show a button to summarize on demand
            briefingContentEl.innerHTML = `
                <div class="briefing-cta">
                    <span>Privacy Policy found.</span>
                    <button class="briefing-summarize-btn" data-url="${escapeHtml(policyUrl)}">Summarize with AI</button>
                </div>
            `;
        } else { // No summary and no policy URL
             briefingContentEl.innerHTML = '<div class="briefing-loading">No AI briefing available for this site yet.</div>';
        }
    }

    function renderBriefing(summaryData) {
        if (!summaryData || !summaryData.summary) {
            briefingContentEl.innerHTML = '<div class="briefing-error">Could not summarize privacy policy.</div>';
            return;
        }

        const tagsHtml = [...(summaryData.dataCollected || []), ...(summaryData.sharedWith || [])]
            .map(tag => `<span class="briefing-tag">${escapeHtml(tag)}</span>`).join('');
        
        briefingContentEl.innerHTML = `
            <p class="briefing-summary">${escapeHtml(summaryData.summary)}</p>
            <div class="briefing-tags">${tagsHtml}</div>
        `;
    }
    
    async function loadPrivacyInsights() {
        const insightsContent = document.getElementById('insights');
        try {
            const insights = await chrome.runtime.sendMessage({ type: 'GET_PRIVACY_INSIGHTS', tabId: currentTab.id });
            if (!insights || insights.length === 0) {
                insightsContent.innerHTML = '<p class="no-items-message">No specific privacy risks detected on this page.</p>';
                return;
            }
            insightsContent.innerHTML = insights.map(insight => `
                <div class="insight-item">
                    <div class="insight-icon type-${insight.type}">${ICONS[insight.icon] || ''}</div>
                    <div class="insight-message">${insight.message}</div>
                </div>
            `).join('');
        } catch (error) {
            console.error("ZenithGuard: Failed to load privacy insights.", error);
            insightsContent.innerHTML = '<p class="no-items-message">Error loading insights.</p>';
        }
    }

    async function loadActivityLog() {
        const activityContent = document.getElementById('activity');
        try {
            const log = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG', tabId: currentTab.id });
    
            if (!Array.isArray(log)) {
                console.error("ZenithGuard: Received invalid network log data from background.", log);
                activityContent.innerHTML = '<p class="no-items-message">Could not load activity.</p>';
                return;
            }
    
            const blocked = log.filter(req => req && req.status === 'blocked');
            
            let html = '';
            if (blocked.length === 0) {
                html = '<p class="no-items-message">No requests blocked on this page yet.</p>';
            } else {
                html = blocked.slice(-10).reverse().map(req => {
                    let hostname = 'Invalid URL';
                    try {
                        hostname = new URL(req.url).hostname;
                    } catch (e) {
                        console.warn('ZenithGuard: Could not parse URL from network log:', req.url);
                    }
                    return `
                        <div class="list-item">
                            <span class="list-item-value" title="${escapeHtml(req.url)}">${hostname}</span>
                        </div>
                    `;
                }).join('');
            }

            const loggerUrl = chrome.runtime.getURL(`pages/logger.html?tabId=${currentTab.id}`);
            html += `<a id="view-log-link" href="${loggerUrl}" class="view-log-link" target="_blank">View Full Network Log</a>`;
            activityContent.innerHTML = html;

        } catch (error) {
            console.error("ZenithGuard: Failed to load activity log.", error);
            activityContent.innerHTML = '<p class="no-items-message">Error loading activity.</p>';
        }
    }

    async function loadCustomRules() {
        const rulesListContainer = document.getElementById('rules-list-container');
        const { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules');
        const rulesForDomain = customHidingRules[currentHostname] || [];

        if (rulesForDomain.length === 0) {
            rulesListContainer.innerHTML = '<p class="no-items-message">No custom hiding rules for this site.</p>';
            return;
        }
        rulesListContainer.innerHTML = rulesForDomain.map((rule, index) => `
            <div class="list-item">
                <span class="list-item-value" title="${escapeHtml(rule.value)}">${escapeHtml(rule.value)}</span>
                <div class="list-item-actions">
                    <button class="delete-rule-btn" data-index="${index}" aria-label="Delete rule">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function loadCookies() {
        const cookiesContent = document.getElementById('cookies');
        try {
            const cookies = await chrome.cookies.getAll({ domain: currentHostname });
            
            if (cookies.length === 0) {
                cookiesContent.innerHTML = '<p class="no-items-message">No cookies found for this site.</p>';
                return;
            }
            cookiesContent.innerHTML = cookies.map(cookie => `
                <div class="list-item">
                    <span class="list-item-value" title="${escapeHtml(cookie.name)}">${escapeHtml(cookie.name)}</span>
                    <div class="list-item-actions">
                        <button class="delete-cookie-btn" data-name="${escapeHtml(cookie.name)}" aria-label="Delete cookie">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error("ZenithGuard: Error loading cookies.", error);
            cookiesContent.innerHTML = '<p class="no-items-message">Could not load cookies. Check permissions.</p>';
        }
    }
    
    async function loadIsolationModeState() {
        const { isolationModeSites = [] } = await chrome.storage.sync.get('isolationModeSites');
        const isActive = isolationModeSites.some(s => s.enabled && s.value === currentHostname);
        isolationModeBtn.classList.toggle('active', isActive);
    }
    
     async function loadForgetfulBrowsingState() {
        const { forgetfulSites = [] } = await chrome.storage.sync.get('forgetfulSites');
        const isActive = forgetfulSites.some(s => s.enabled && s.value === currentHostname);
        forgetfulBrowsingBtn.classList.toggle('active', isActive);
    }

    // --- Event Listeners ---
    function attachEventListeners() {
        powerBtn.addEventListener('click', handlePowerToggle);
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });

        openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
        
        openInspectorBtn.addEventListener('click', async () => {
             try {
                await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    files: ['js/content/inspector.js']
                });
                chrome.tabs.sendMessage(currentTab.id, { type: 'START_INSPECTOR_MODE' });
                window.close();
             } catch(e) {
                 showToast({ message: "Could not activate Inspector on this page.", type: "error" });
             }
        });

        zapperModeBtn.addEventListener('click', async () => {
             try {
                await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    files: ['js/content/zapper.js']
                });
                chrome.tabs.sendMessage(currentTab.id, { type: 'START_ZAPPER_MODE' });
                window.close();
             } catch(e) {
                 showToast({ message: "Could not activate Zapper on this page.", type: "error" });
             }
        });
        
        isolationModeBtn.addEventListener('click', handleIsolationToggle);
        forgetfulBrowsingBtn.addEventListener('click', handleForgetfulToggle);
        pauseBtn.addEventListener('click', handlePause);
        defeatWallBtn.addEventListener('click', handleDefeatWall);

        document.getElementById('rules').addEventListener('click', handleRuleDelete);
        document.getElementById('cookies').addEventListener('click', handleCookieDelete);
        briefingContentEl.addEventListener('click', handleSummarizeClick);
        document.getElementById('add-rule-btn').addEventListener('click', handleAddRule);
    }

    // --- Event Handlers ---
    async function handlePowerToggle() {
        chrome.runtime.sendMessage({
            type: 'TOGGLE_SITE_PROTECTION',
            data: {
                domain: currentHostname,
                tabId: currentTab.id
            }
        });
        
        isSiteDisabled = !isSiteDisabled;
        updatePowerButtonUI();
        window.close();
    }
    
    async function handleIsolationToggle() {
        let { isolationModeSites = [] } = await chrome.storage.sync.get('isolationModeSites');
        const existingRule = isolationModeSites.find(r => r.value === currentHostname);

        let isNowEnabled;
        if (existingRule) {
            existingRule.enabled = !existingRule.enabled;
            isNowEnabled = existingRule.enabled;
        } else {
            isolationModeSites.push({ value: currentHostname, enabled: true });
            isNowEnabled = true;
        }
        await chrome.storage.sync.set({ isolationModeSites });
        loadIsolationModeState();
        showToast({ message: `Isolation Mode ${isNowEnabled ? 'enabled' : 'disabled'}. Reload page to apply.` });
    }
    
    async function handleForgetfulToggle() {
        let { forgetfulSites = [] } = await chrome.storage.sync.get('forgetfulSites');
        const existingRule = forgetfulSites.find(site => site.value === currentHostname);
        let isNowEnabled;
        if (existingRule) {
            existingRule.enabled = !existingRule.enabled;
            isNowEnabled = existingRule.enabled;
        } else {
            forgetfulSites.push({ value: currentHostname, enabled: true });
            isNowEnabled = true;
        }
        await chrome.storage.sync.set({ forgetfulSites });
        loadForgetfulBrowsingState();
        showToast({ message: `Forgetful Browsing ${isNowEnabled ? 'enabled' : 'disabled'}.` });
    }
    
    async function handleRuleDelete(e) {
        if (!e.target.closest('.delete-rule-btn')) return;
        const index = parseInt(e.target.closest('.delete-rule-btn').dataset.index);
        let { customHidingRules } = await chrome.storage.sync.get('customHidingRules');
        customHidingRules[currentHostname].splice(index, 1);
        await chrome.storage.sync.set({ customHidingRules });
        loadCustomRules(); // Refresh list
    }

    async function handleCookieDelete(e) {
        if (!e.target.closest('.delete-cookie-btn')) return;
        const name = e.target.closest('.delete-cookie-btn').dataset.name;
        await chrome.cookies.remove({ url: currentTab.url, name: name });
        loadCookies(); // Refresh list
    }

    async function handleSummarizeClick(e) {
        const button = e.target.closest('.briefing-summarize-btn');
        if (!button || button.disabled) return;

        button.disabled = true;
        button.innerHTML = '<div class="briefing-spinner"></div> Summarizing...';

        const policyUrl = button.dataset.url;
        await chrome.runtime.sendMessage({
            type: 'SUMMARIZE_PRIVACY_POLICY',
            data: { domain: currentHostname, policyUrl }
        });

        setTimeout(loadAIBriefing, 500);
    }

    async function handleAddRule() {
        const input = document.getElementById('add-rule-input');
        const selector = input.value.trim();

        if (!selector) {
            showToast({ message: 'Selector cannot be empty.', type: 'error' });
            return;
        }
        
        // Preview the rule on the page
        try {
            await chrome.tabs.sendMessage(currentTab.id, { type: 'PREVIEW_MANUAL_RULE', selector });
        } catch(e) {
            console.warn("Could not send preview message, content script might not be active.", e);
        }

        // Save the rule
        try {
            let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules');
            if (!customHidingRules[currentHostname]) {
                customHidingRules[currentHostname] = [];
            }
            
            if (!customHidingRules[currentHostname].some(r => r.value === selector)) {
                customHidingRules[currentHostname].push({ value: selector, enabled: true });
                await chrome.storage.sync.set({ customHidingRules });
                showToast({ message: 'Hiding rule added!' });
            } else {
                showToast({ message: 'This hiding rule already exists.', type: 'error' });
            }

            input.value = ''; // Clear input
            await loadCustomRules(); // Refresh the list
        } catch (e) {
            console.error("Failed to save hiding rule.", e);
            showToast({ message: 'Failed to save rule.', type: 'error' });
        }
    }

    // --- NEW: Defeat Adblock Wall Handler ---
    async function handleDefeatWall() {
        defeatWallBtn.disabled = true;
        defeatWallBtn.classList.add('loading');

        let success = false;
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'DEFEAT_ADBLOCK_WALL',
                data: { tabId: currentTab.id }
            });
            if (response.error) {
                throw new Error(response.error);
            }
            if (response.selectors && response.selectors.overlaySelector) {
                await chrome.tabs.sendMessage(currentTab.id, { 
                    type: 'EXECUTE_ADBLOCK_WALL_FIX', 
                    selectors: response.selectors 
                });
                success = true;
            } else {
                 throw new Error("AI could not find a wall to defeat.");
            }
        } catch (error) {
            console.error("ZenithGuard: Adblock wall defeat failed.", error);
            if (error.message === 'QUOTA_EXCEEDED') {
                showToast({ message: 'AI is busy due to high demand. Please try again in a moment.', type: 'error' });
            } else {
                showToast({ message: error.message, type: 'error' });
            }
        } finally {
            if (success) {
                window.close();
            } else {
                defeatWallBtn.classList.remove('loading');
                defeatWallBtn.disabled = false;
            }
        }
    }


    // --- Pause Handlers ---
    async function handlePause() {
        const response = await chrome.runtime.sendMessage({ type: 'PAUSE_PROTECTION' });
        if (response.success) {
            showPausedView(response.pauseUntil);
        }
    }

    async function handleResume() {
        await chrome.runtime.sendMessage({ type: 'RESUME_PROTECTION' });
        clearInterval(pauseInterval);
        pausedView.style.display = 'none';
        normalView.style.display = 'block';
        window.close();
    }

    function showPausedView(pauseUntil) {
        normalView.style.display = 'none';
        pausedView.style.display = 'block';
        updatePauseTimer(pauseUntil);
        pauseInterval = setInterval(() => updatePauseTimer(pauseUntil), 1000);
        resumeBtn.addEventListener('click', handleResume);
    }

    function updatePauseTimer(pauseUntil) {
        const remaining = Math.max(0, pauseUntil - Date.now());
        if (remaining === 0) {
            handleResume();
            return;
        }
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        pauseTimerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }


    // --- UI Update Functions ---
    function updatePowerButtonUI() {
        powerBtn.classList.toggle('enabled', !isSiteDisabled);
        powerBtn.classList.toggle('disabled', isSiteDisabled);
        powerIconEnabled.style.display = isSiteDisabled ? 'none' : 'block';
        powerIconDisabled.style.display = isSiteDisabled ? 'block' : 'none';
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    initialize();
});
