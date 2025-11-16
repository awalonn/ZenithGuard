// js/settings/modules/general_settings_manager.js

export class GeneralSettingsManager {
    constructor(syncSettings, showToast) {
        this.settings = syncSettings;
        this.showToast = showToast;
        this.toggles = document.querySelectorAll('.setting-item input[type="checkbox"]');
    }

    initialize() {
        this.loadSettings();
        this.attachEventListeners();
    }
    
    loadSettings() {
        this.toggles.forEach(toggle => {
            const settingName = toggle.dataset.setting;
            if (this.settings.hasOwnProperty(settingName)) {
                toggle.checked = this.settings[settingName];
            }
        });
    }

    attachEventListeners() {
        this.toggles.forEach(toggle => {
            toggle.addEventListener('change', this.handleToggleChange.bind(this));
        });
    }

    async handleToggleChange(e) {
        const settingName = e.target.dataset.setting;
        const isEnabled = e.target.checked;
        await chrome.storage.sync.set({ [settingName]: isEnabled });
        this.settings[settingName] = isEnabled; // Update local state
        this.showToast('Setting saved!', 'success');
    }
}
