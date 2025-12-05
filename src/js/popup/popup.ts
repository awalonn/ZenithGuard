// popup.ts
import { AppSettings, HidingRule } from '../types.js';

interface LocalStorageData {

    auditHistory: Array<{ domain: string; grade: string }>;
    [key: string]: any;
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Elements ---
    const powerBtn = document.getElementById('power-btn') as HTMLElement;
    const powerIconEnabled = document.getElementById('power-icon-enabled') as HTMLElement;
    const powerIconDisabled = document.getElementById('power-icon-disabled') as HTMLElement;
    const siteHostnameEl = document.getElementById('site-hostname') as HTMLElement;
    const privacyGradeBadge = document.getElementById('privacy-grade-badge') as HTMLAnchorElement;
    const briefingContentEl = document.getElementById('briefing-content') as HTMLElement;

    // NEW: Per-site toggle
    const perSiteToggle = document.getElementById('per-site-toggle') as HTMLInputElement;

    // NEW: Stats Elements
    const adsBlockedCountEl = document.getElementById('ads-blocked-count');
    const trackersBlockedCountEl = document.getElementById('trackers-blocked-count');

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const openSettingsBtn = document.getElementById('open-settings-btn') as HTMLElement;
    const openInspectorBtn = document.getElementById('open-inspector-btn') as HTMLElement;
    const isolationModeBtn = document.getElementById('isolation-mode-btn') as HTMLElement;
    const forgetfulBrowsingBtn = document.getElementById('forgetful-browsing-btn') as HTMLElement;
    const pauseBtn = document.getElementById('pause-protection-btn') as HTMLElement;
    const zapperModeBtn = document.getElementById('zapper-mode-btn') as HTMLElement;
    const defeatWallBtn = document.getElementById('defeat-wall-btn') as HTMLButtonElement | null;

    // Paused state UI
    const normalView = document.getElementById('normal-view') as HTMLElement;
    const pausedView = document.getElementById('paused-view') as HTMLElement;
    const resumeBtn = document.getElementById('resume-btn') as HTMLElement;
    const pauseTimerEl = document.getElementById('pause-timer') as HTMLElement;

    // --- State ---
    let currentTab: chrome.tabs.Tab | undefined;
    let currentHostname: string = '';
    let isGloballyEnabled = true;
    let isSiteDisabled = false;
    let pauseInterval: ReturnType<typeof setInterval> | null = null;

    // --- SVG Icons for Insights ---
    const ICONS: Record<string, string> = {
        record: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" /></svg>',
        database: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,3C7.58,3 4,4.79 4,7V17C4,19.21 7.58,21 12,21C16.42,21 20,19.21 20,17V7C20,4.79 16.42,3 12,3M18,7C18,7.42 17.3,7.8 16.47,8.08C15.65,8.37 14.56,8.59 13.22,8.72C13.54,8.22 13.78,7.65 13.91,7.03C15.3,6.72 16.88,6.83 18,7M12,5C14.76,5 17.27,5.84 18.5,6.86C18.17,10.05 15.61,12.38 12.5,12.47C12.33,12.47 12.17,12.47 12,12.47C8.5,12.47 5.6,9.82 5.5,6.5C6.83,5.73 9.24,5 12,5M6,8.09C6.83,7.81 7.92,7.6 9.25,7.46C8.94,8 8.7,8.59 8.58,9.21C7.22,9.08 6.1,8.87 5.5,8.5C5.7,8.37 5.85,8.23 6,8.09M6,17C6,16.58 6.7,16.2 7.53,15.92C8.35,15.63 9.44,15.41 10.78,15.28C10.46,15.78 10.22,16.35 10.09,16.97C8.7,17.28 7.12,17.17 6,17M12,19C9.24,19 6.73,18.16 5.5,17.14C5.83,13.95 8.39,11.62 11.5,11.53C11.67,11.53 11.83,11.53 12,11.53C15.5,11.53 18.4,14.18 18.5,17.5C17.17,18.27 14.76,19 12,19Z" /></svg>',
        megaphone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3.26L10 7.26V3.26H8V7.26L4 3.26L2.6 4.67L6.6 8.67H2V10.67H6.6L2.6 14.67L4 16.08L8 12.08V16.08H10V12.08L14 16.08L15.4 14.67L11.4 10.67H22V8.67H11.4L15.4 4.67L14 3.26Z" /></svg>',
        shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z" /></svg>'
    };

    // --- Initialization ---
    async function initialize() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tabs[0];

        if (!currentTab || !currentTab.url || !currentTab.id || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('file://')) {
            renderUnsupportedPage();
            return;
        }

        const { protectionPausedUntil } = await chrome.storage.session.get('protectionPausedUntil') as { protectionPausedUntil?: number };
        if (protectionPausedUntil && protectionPausedUntil > Date.now()) {
            showPausedView(protectionPausedUntil);
            return;
        }

        // Lazy-inject policy finder on popup open
        try {
            await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['js/policy_finder.js'] // Using the mapped path from viteStaticCopy
            });
        } catch (e: any) {
            if (String(e.message).includes('Frame with ID 0 is showing error page') || String(e.message).includes('Cannot access')) {
                console.log("ZenithGuard: Cannot inject policy finder on this page. This is expected for error pages.");
            } else {
                console.warn("ZenithGuard: Could not inject policy finder.", e);
            }
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
        const {
            disabledSites = [],
            isProtectionEnabled = true
        } = await chrome.storage.sync.get(['disabledSites', 'isProtectionEnabled']) as AppSettings;

        isGloballyEnabled = isProtectionEnabled;
        isSiteDisabled = disabledSites.includes(currentHostname);

        updatePowerButtonUI();
        updatePerSiteToggleUI();
    }

    async function loadAIBriefing() {
        briefingContentEl.innerHTML = '<div class="briefing-loading">Checking for insights...</div>';

        const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
        if (!geminiApiKey) {
            privacyGradeBadge.style.display = 'none';
            briefingContentEl.innerHTML = `
                <div class="briefing-cta-missing-key">
                    <span>AI features are disabled.</span>
                    <button id="go-to-settings-btn" class="briefing-cta-btn">Add API Key</button>
                </div>
            `;
            const btn = document.getElementById('go-to-settings-btn');
            if (btn) btn.addEventListener('click', () => {
                chrome.runtime.openOptionsPage();
            });
            return;
        }

        const summaryCacheKey = `privacy-summary-${currentHostname}`;
        const policyUrlKey = `privacy-policy-url-${currentHostname}`;
        const { auditHistory = [], ...storageData } = await chrome.storage.local.get(['auditHistory', summaryCacheKey, policyUrlKey]) as LocalStorageData;

        const lastScan = auditHistory.find(item => item.domain === currentHostname);
        const analyzerUrl = chrome.runtime.getURL(`src/pages/analyzer.html?tabId=${currentTab!.id}&url=${encodeURIComponent(currentTab!.url!)}`);

        privacyGradeBadge.href = analyzerUrl;
        if (lastScan) {
            privacyGradeBadge.textContent = lastScan.grade;
            privacyGradeBadge.className = `grade-badge grade-${lastScan.grade.toLowerCase()}`;
        } else {
            privacyGradeBadge.textContent = 'Scan';
            privacyGradeBadge.className = 'grade-badge grade-none';
        }

        const summaryData = storageData[summaryCacheKey];
        const policyUrl = storageData[policyUrlKey];

        if (summaryData) {
            if (summaryData.error) {
                const errorMessage = summaryData.error.includes('QUOTA')
                    ? "AI analysis quota exceeded."
                    : "Failed to analyze privacy policy.";
                briefingContentEl.innerHTML = `<div class="briefing-error">${escapeHtml(errorMessage)}</div>`;
            } else {
                renderBriefing(summaryData.summary);
            }
        } else if (policyUrl) {
            briefingContentEl.innerHTML = `
                <div class="briefing-cta">
                    <span>Privacy Policy found.</span>
                    <button class="briefing-summarize-btn" data-url="${escapeHtml(policyUrl)}">Summarize with AI</button>
                </div>
            `;
        } else {
            briefingContentEl.innerHTML = '<div class="briefing-loading">No AI briefing available for this site yet.</div>';
        }
    }

    function renderBriefing(summaryData: { summary: string, dataCollected?: string[], sharedWith?: string[] }) {
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
        // UPDATED: Target the list inside the Insights tab
        const insightsList = document.getElementById('insights-list');
        if (!insightsList) return;

        try {
            const insights = await chrome.runtime.sendMessage({ type: 'GET_PRIVACY_INSIGHTS', tabId: currentTab!.id });
            if (!insights || insights.length === 0) {
                insightsList.innerHTML = '<p class="no-items-message">No specific privacy risks detected.</p>';
                return;
            }
            insightsList.innerHTML = insights.map((insight: any) => `
                <div class="insight-item">
                    <div class="insight-icon type-${insight.type}">${ICONS[insight.icon] || ''}</div>
                    <div class="insight-message">${insight.message}</div>
                </div>
            `).join('');
        } catch (error: any) {
            console.error("ZenithGuard: Failed to load privacy insights.", error.message);
            insightsList.innerHTML = '<p class="no-items-message">Error loading insights.</p>';
        }
    }

    async function loadActivityLog() {
        const activityContent = document.getElementById('activity');
        try {
            const log = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG', tabId: currentTab!.id });

            if (!Array.isArray(log)) {
                if (activityContent) activityContent.innerHTML = '<p class="no-items-message">Could not load activity.</p>';
                return;
            }

            const blocked = log.filter(req => req && req.status === 'blocked');

            // NEW: Update Stats
            if (adsBlockedCountEl) adsBlockedCountEl.textContent = String(blocked.length);
            // For now, we assume all blocked are "ads/trackers". 
            // In a real app, we'd distinguish types.
            if (trackersBlockedCountEl) trackersBlockedCountEl.textContent = String(blocked.length);

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

            const loggerUrl = chrome.runtime.getURL(`src/pages/logger.html?tabId=${currentTab!.id}`);
            html += `<a id="view-log-link" href="${loggerUrl}" class="view-log-link" target="_blank">View Full Network Log</a>`;

            if (activityContent) activityContent.innerHTML = html;

        } catch (error) {
            console.error("ZenithGuard: Failed to load activity log.", error);
            if (activityContent) activityContent.innerHTML = '<p class="no-items-message">Error loading activity.</p>';
        }
    }

    async function loadCustomRules() {
        const rulesListContainer = document.getElementById('rules-list-container');
        if (!rulesListContainer) return;

        const { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
        const rulesForDomain = customHidingRules[currentHostname] || [];

        if (rulesForDomain.length === 0) {
            rulesListContainer.innerHTML = '<p class="no-items-message">No custom hiding rules.</p>';
            return;
        }
        rulesListContainer.innerHTML = rulesForDomain.map((rule, index) => {
            const val = typeof rule === 'string' ? rule : rule.value;
            return `
            <div class="list-item">
                <span class="list-item-value" title="${escapeHtml(val)}">${escapeHtml(val)}</span>
                <div class="list-item-actions">
                    <button class="delete-rule-btn" data-index="${index}" aria-label="Delete rule">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `}).join('');
    }

    async function loadCookies() {
        const cookiesContent = document.getElementById('cookies');
        if (!cookiesContent) return;

        try {
            const cookies = await chrome.cookies.getAll({ domain: currentHostname });

            if (cookies.length === 0) {
                cookiesContent.innerHTML = '<p class="no-items-message">No cookies found.</p>';
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
            cookiesContent.innerHTML = '<p class="no-items-message">Could not load cookies.</p>';
        }
    }

    async function loadIsolationModeState() {
        const { isolationModeSites = [] } = await chrome.storage.sync.get('isolationModeSites') as AppSettings;
        // @ts-ignore - Assuming array of objects although strict type implies string[]
        const isActive = isolationModeSites.some((s: any) => s.enabled && s.value === currentHostname);
        if (isolationModeBtn) isolationModeBtn.classList.toggle('active', isActive);
    }

    async function loadForgetfulBrowsingState() {
        const { forgetfulSites = [] } = await chrome.storage.sync.get('forgetfulSites') as AppSettings;
        // @ts-ignore
        const isActive = forgetfulSites.some((s: any) => s.enabled && s.value === currentHostname);
        if (forgetfulBrowsingBtn) forgetfulBrowsingBtn.classList.toggle('active', isActive);
    }

    // --- Event Listeners ---
    async function getCurrentTab() {
        return currentTab;
    }

    function attachEventListeners() {
        powerBtn.addEventListener('click', handleGlobalPowerToggle);
        perSiteToggle.addEventListener('change', handlePerSiteToggle);

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const btn = button as HTMLElement;
                const tabId = btn.dataset.tab;
                if (!tabId) return;

                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(tabId)?.classList.add('active');
            });
        });

        openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

        // --- Tool Buttons ---


        document.getElementById('zapper-mode-btn')?.addEventListener('click', async () => {
            const tab = await getCurrentTab();
            if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'START_ZAPPER_MODE' });
            window.close();
        });

        document.getElementById('open-inspector-btn')?.addEventListener('click', async () => {
            const tab = await getCurrentTab();
            if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'START_INSPECTOR_MODE' });
            window.close();
        });

        document.getElementById('fix-cookies-btn')?.addEventListener('click', async () => {
            const tab = await getCurrentTab();
            if (tab && tab.id) {
                window.ZenithGuardToastUtils.showToast({ message: 'AI is looking for cookie banners...', type: 'loading' });
                chrome.runtime.sendMessage({ type: 'HANDLE_COOKIE_CONSENT_ACTION', data: { tabId: tab.id } });
            }
        });

        document.getElementById('privacy-grade-badge')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const tab = await getCurrentTab();
            if (tab && tab.id) {
                const analyzerUrl = chrome.runtime.getURL(`src/pages/analyzer.html?tabId=${tab.id}&url=${encodeURIComponent(tab.url!)}`);
                chrome.tabs.create({ url: analyzerUrl });
            }
        });

        isolationModeBtn?.addEventListener('click', handleIsolationToggle);
        forgetfulBrowsingBtn?.addEventListener('click', handleForgetfulToggle);
        pauseBtn?.addEventListener('click', handlePause);
        defeatWallBtn?.addEventListener('click', handleDefeatWall);

        // Updated event delegation for rules list
        const rulesList = document.getElementById('rules-list-container');
        if (rulesList) rulesList.addEventListener('click', handleRuleDelete);

        // Updated event delegation for cookies list (if visible)
        const cookiesList = document.getElementById('cookies');
        if (cookiesList) cookiesList.addEventListener('click', handleCookieDelete);

        briefingContentEl.addEventListener('click', handleSummarizeClick);
        document.getElementById('add-rule-btn')?.addEventListener('click', handleAddRule);
    }

    // --- Event Handlers ---

    async function handleGlobalPowerToggle() {
        isGloballyEnabled = !isGloballyEnabled;

        await chrome.storage.sync.set({ isProtectionEnabled: isGloballyEnabled });

        await chrome.runtime.sendMessage({
            type: 'TOGGLE_GLOBAL_PROTECTION',
            data: { isEnabled: isGloballyEnabled }
        });

        updatePowerButtonUI();
        updatePerSiteToggleUI();

        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of tabs) {
            try {
                if (tab.id && currentTab && tab.id !== currentTab.id) {
                    chrome.tabs.reload(tab.id);
                }
            } catch (e) {
                console.warn(`Could not reload tab: ${tab.id}`);
            }
        }

        if (currentTab?.id) chrome.tabs.reload(currentTab.id);
        window.close();
    }

    async function handlePerSiteToggle() {
        isSiteDisabled = !perSiteToggle.checked;

        const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites') as Pick<AppSettings, 'disabledSites'>;
        let newDisabledSites: string[];
        if (isSiteDisabled) {
            newDisabledSites = [...new Set([...disabledSites, currentHostname])];
        } else {
            // @ts-ignore
            newDisabledSites = disabledSites.filter(d => d !== currentHostname);
        }
        await chrome.storage.sync.set({ disabledSites: newDisabledSites });

        await chrome.runtime.sendMessage({
            type: 'APPLY_RULES_AND_RELOAD_TAB',
            data: {
                tabId: currentTab!.id
            }
        });

        updatePerSiteToggleUI();
        window.close();
    }

    async function handleIsolationToggle() {
        let { isolationModeSites = [] } = await chrome.storage.sync.get('isolationModeSites') as AppSettings;
        // @ts-ignore
        const existingRule = isolationModeSites.find((r: any) => r.value === currentHostname);

        let isNowEnabled;
        if (existingRule) {
            // @ts-ignore
            existingRule.enabled = !existingRule.enabled;
            // @ts-ignore
            isNowEnabled = existingRule.enabled;
        } else {
            // @ts-ignore
            isolationModeSites.push({ value: currentHostname, enabled: true });
            isNowEnabled = true;
        }
        await chrome.storage.sync.set({ isolationModeSites });
        loadIsolationModeState();
        window.ZenithGuardToastUtils.showToast({ message: `Isolation Mode ${isNowEnabled ? 'enabled' : 'disabled'}. Reload page to apply.` });
    }

    async function handleForgetfulToggle() {
        let { forgetfulSites = [] } = await chrome.storage.sync.get('forgetfulSites') as AppSettings;
        // @ts-ignore
        const existingRule = forgetfulSites.find((site: any) => site.value === currentHostname);
        let isNowEnabled;
        if (existingRule) {
            // @ts-ignore
            existingRule.enabled = !existingRule.enabled;
            // @ts-ignore
            isNowEnabled = existingRule.enabled;
        } else {
            // @ts-ignore
            forgetfulSites.push({ value: currentHostname, enabled: true });
            isNowEnabled = true;
        }
        await chrome.storage.sync.set({ forgetfulSites });
        loadForgetfulBrowsingState();
        window.ZenithGuardToastUtils.showToast({ message: `Forgetful Browsing ${isNowEnabled ? 'enabled' : 'disabled'}.` });
    }

    async function handleRuleDelete(e: Event) {
        const target = e.target as HTMLElement;
        const btn = target.closest('.delete-rule-btn') as HTMLElement;
        if (!btn) return;
        const index = parseInt(btn.dataset.index!);
        let { customHidingRules } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
        customHidingRules[currentHostname].splice(index, 1);
        await chrome.storage.sync.set({ customHidingRules });
        loadCustomRules();
    }

    async function handleCookieDelete(e: Event) {
        const target = e.target as HTMLElement;
        const btn = target.closest('.delete-cookie-btn') as HTMLElement;
        if (!btn) return;
        const name = btn.dataset.name!;
        await chrome.cookies.remove({ url: currentTab!.url!, name: name });
        loadCookies();
    }

    async function handleSummarizeClick(e: Event) {
        const target = e.target as HTMLElement;
        const button = target.closest('.briefing-summarize-btn') as HTMLButtonElement;
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
        const input = document.getElementById('add-rule-input') as HTMLInputElement;
        const selector = input.value.trim();

        if (!selector) {
            window.ZenithGuardToastUtils.showToast({ message: 'Selector cannot be empty.', type: 'error' });
            return;
        }

        try {
            await chrome.tabs.sendMessage(currentTab!.id!, { type: 'PREVIEW_MANUAL_RULE', selector });
        } catch (e) {
            console.warn("Could not send preview message, content script might not be active.", e);
        }

        try {
            let { customHidingRules = {} } = await chrome.storage.sync.get('customHidingRules') as AppSettings;
            if (!customHidingRules[currentHostname]) {
                customHidingRules[currentHostname] = [];
            }

            if (!customHidingRules[currentHostname].some(r => r.value === selector)) {
                customHidingRules[currentHostname].push({ value: selector, enabled: true });
                await chrome.storage.sync.set({ customHidingRules });
                window.ZenithGuardToastUtils.showToast({ message: 'Hiding rule added!' });
            } else {
                window.ZenithGuardToastUtils.showToast({ message: 'This hiding rule already exists.', type: 'error' });
            }

            input.value = '';
            await loadCustomRules();
        } catch (e) {
            console.error("Failed to save hiding rule.", e);
            window.ZenithGuardToastUtils.showToast({ message: 'Failed to save rule.', type: 'error' });
        }
    }

    async function handleDefeatWall() {
        if (!defeatWallBtn) return;
        defeatWallBtn.disabled = true;
        defeatWallBtn.classList.add('loading');

        let success = false;
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'DEFEAT_ADBLOCK_WALL',
                data: { tabId: currentTab!.id }
            });
            if (response.error) {
                throw new Error(response.error);
            }
            if (response.selectors && response.selectors.overlaySelector) {
                await chrome.tabs.sendMessage(currentTab!.id!, {
                    type: 'EXECUTE_ADBLOCK_WALL_FIX',
                    selectors: response.selectors
                });
                success = true;
            } else {
                throw new Error("AI could not find a wall to defeat.");
            }
        } catch (error: any) {
            console.error("ZenithGuard: Adblock wall defeat failed.", error);
            if (error.message === 'QUOTA_EXCEEDED') {
                window.ZenithGuardToastUtils.showToast({ message: 'AI is busy due to high demand. Please try again in a moment.', type: 'error' });
            } else {
                window.ZenithGuardToastUtils.showToast({ message: error.message, type: 'error' });
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
        if (pauseInterval) clearInterval(pauseInterval);
        pausedView.style.display = 'none';
        normalView.style.display = 'block';
        window.close();
    }

    function showPausedView(pauseUntil: number) {
        normalView.style.display = 'none';
        pausedView.style.display = 'block';
        updatePauseTimer(pauseUntil);
        pauseInterval = setInterval(() => updatePauseTimer(pauseUntil), 1000);
        resumeBtn.addEventListener('click', handleResume);
    }

    function updatePauseTimer(pauseUntil: number) {
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
        powerBtn.classList.toggle('enabled', isGloballyEnabled);
        powerBtn.classList.toggle('disabled', !isGloballyEnabled);
        powerIconEnabled.style.display = isGloballyEnabled ? 'block' : 'none';
        powerIconDisabled.style.display = !isGloballyEnabled ? 'block' : 'none';
    }

    function updatePerSiteToggleUI() {
        perSiteToggle.checked = !isSiteDisabled;

        if (!isGloballyEnabled) {
            perSiteToggle.disabled = true;
        } else {
            perSiteToggle.disabled = false;
        }
    }

    function escapeHtml(unsafe: string | undefined): string {
        if (!unsafe) return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    initialize();
});