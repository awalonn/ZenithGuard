// js/settings/modules/data_manager.js
export class DataManager {
    constructor(showToast) {
        this.showToast = showToast;
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.importFileInput = document.getElementById('import-file-input');
        this.resetBtn = document.getElementById('reset-btn');
    }

    initialize() {
        this.attachEventListeners();
    }

    attachEventListeners() {
        this.exportBtn.addEventListener('click', this.exportSettings.bind(this));
        this.importBtn.addEventListener('click', () => this.importFileInput.click());
        this.importFileInput.addEventListener('change', this.importSettings.bind(this));
        this.resetBtn.addEventListener('click', this.resetSettings.bind(this));
    }

    async exportSettings() {
        const settingsToExport = await chrome.storage.sync.get(null);
        const dataStr = JSON.stringify(settingsToExport, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zenithguard-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Settings exported!', 'success');
    }

    importSettings(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedSettings = JSON.parse(e.target.result);
                // Simple validation
                if (typeof importedSettings !== 'object' || !importedSettings.hasOwnProperty('isHeuristicEngineEnabled')) {
                    throw new Error("Invalid settings file format.");
                }
                await chrome.storage.sync.set(importedSettings);
                this.showToast('Settings imported successfully! Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                this.showToast(`Error importing settings: ${error.message}`, 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }

    resetSettings() {
        if (confirm("Are you sure you want to reset all rules to their defaults? This will clear your custom hiding rules, network blocklist, and popup list.")) {
            chrome.runtime.sendMessage({ type: 'RESET_SETTINGS_TO_DEFAULTS' }, (response) => {
                if (response.success) {
                    this.showToast('Settings reset successfully! Reloading...', 'success');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    this.showToast('Failed to reset settings.', 'error');
                }
            });
        }
    }
}
