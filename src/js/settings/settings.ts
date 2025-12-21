// settings.ts - Main Orchestrator
import { UIManager } from './modules/ui_manager.js';
import { RulesManager } from './modules/rules_manager.js';
import { DashboardManager } from './modules/dashboard_manager.js';
import { ApiKeyManager } from './modules/api_key_manager.js';
import { AuditHistoryManager } from './modules/audit_history_manager.js';
import { DataManager } from './modules/data_manager.js';
import { GeneralSettingsManager } from './modules/general_settings_manager.js';
import { AppSettings } from '../types.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- Initial Load ---
    const syncSettings = (await chrome.storage.sync.get(null)) as AppSettings;
    const localSettings = await chrome.storage.local.get(['dailyBlocks', 'auditHistory']);

    // --- Module Initialization ---
    // UI Manager is foundational as it provides theme and toast notifications
    const uiManager = new UIManager();
    uiManager.initialize(syncSettings);

    // Initialize all other managers, passing dependencies as needed
    const generalSettingsManager = new GeneralSettingsManager(syncSettings, uiManager.showToast);
    generalSettingsManager.initialize();

    const rulesManager = new RulesManager(syncSettings, uiManager.showToast);
    rulesManager.initialize();

    const dashboardManager = new DashboardManager();
    dashboardManager.initialize();

    // Hook up tab switching to re-render dashboard
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-tab') === 'dashboard') {
                dashboardManager.renderDashboard();
            }
        });
    });

    const apiKeyManager = new ApiKeyManager(syncSettings, uiManager.showToast);
    apiKeyManager.initialize();

    // @ts-ignore - LocalSettings type needs to be defined if strictness is required here
    const auditHistoryManager = new AuditHistoryManager(localSettings, uiManager.showToast);
    auditHistoryManager.initialize();

    const dataManager = new DataManager(uiManager.showToast);
    dataManager.initialize();
});