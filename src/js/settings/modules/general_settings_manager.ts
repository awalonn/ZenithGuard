// js/settings/modules/general_settings_manager.ts
import { AppSettings } from '../../types.js';

export class GeneralSettingsManager {
    private settings: AppSettings;
    private showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    private toggles: NodeListOf<HTMLInputElement>;
    private youtubeRulesInput: HTMLInputElement | null;
    private trackerListInput: HTMLInputElement | null;
    private saveAdvancedBtn: HTMLElement | null;

    constructor(syncSettings: AppSettings, showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
        this.settings = syncSettings;
        this.showToast = showToast;
        this.toggles = document.querySelectorAll('.setting-item input[type="checkbox"]');

        // Advanced Settings Elements
        this.youtubeRulesInput = document.getElementById('youtube-rules-url') as HTMLInputElement;
        this.trackerListInput = document.getElementById('tracker-list-url') as HTMLInputElement;
        this.saveAdvancedBtn = document.getElementById('save-advanced-settings');
    }

    initialize(): void {
        this.loadSettings();
        this.attachEventListeners();
    }

    loadSettings(): void {
        this.toggles.forEach(toggle => {
            const settingName = toggle.dataset.setting as keyof AppSettings;
            if (this.settings.hasOwnProperty(settingName)) {
                // @ts-ignore - Boolean/Settings type mismatch helper
                toggle.checked = !!this.settings[settingName];
            }
        });

        // Load Advanced Settings
        if (this.youtubeRulesInput && this.settings.youtubeRulesUrl) {
            this.youtubeRulesInput.value = this.settings.youtubeRulesUrl;
        }
        if (this.trackerListInput && this.settings.trackerListUrl) {
            this.trackerListInput.value = this.settings.trackerListUrl;
        }
    }

    attachEventListeners(): void {
        this.toggles.forEach(toggle => {
            toggle.addEventListener('change', this.handleToggleChange.bind(this));
        });

        if (this.saveAdvancedBtn) {
            this.saveAdvancedBtn.addEventListener('click', this.handleSaveAdvancedSettings.bind(this));
        }
    }

    async handleToggleChange(e: Event): Promise<void> {
        const target = e.target as HTMLInputElement;
        const settingName = target.dataset.setting as keyof AppSettings;
        const isEnabled = target.checked;

        await chrome.storage.sync.set({ [settingName]: isEnabled });
        // @ts-ignore
        this.settings[settingName] = isEnabled; // Update local state
        this.showToast('Setting saved!', 'success');
    }

    async handleSaveAdvancedSettings(): Promise<void> {
        if (!this.youtubeRulesInput || !this.trackerListInput) return;

        const youtubeRulesUrl = this.youtubeRulesInput.value.trim();
        const trackerListUrl = this.trackerListInput.value.trim();

        if (youtubeRulesUrl && !this.isValidUrl(youtubeRulesUrl)) {
            this.showToast('Invalid YouTube Rules URL', 'error');
            return;
        }

        if (trackerListUrl && !this.isValidUrl(trackerListUrl)) {
            this.showToast('Invalid Tracker List URL', 'error');
            return;
        }

        await chrome.storage.sync.set({
            youtubeRulesUrl,
            trackerListUrl
        });

        // Update local state
        this.settings.youtubeRulesUrl = youtubeRulesUrl;
        this.settings.trackerListUrl = trackerListUrl;

        this.showToast('Advanced settings saved!', 'success');
    }

    isValidUrl(string: string): boolean {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}
