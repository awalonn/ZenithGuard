// js/settings/modules/data_manager.ts
export class DataManager {
    private showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    private exportBtn: HTMLElement | null;
    private importBtn: HTMLElement | null;
    private importFileInput: HTMLInputElement | null;
    private resetBtn: HTMLElement | null;

    constructor(showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
        this.showToast = showToast;
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.importFileInput = document.getElementById('import-file-input') as HTMLInputElement;
        this.resetBtn = document.getElementById('reset-btn');
    }

    initialize(): void {
        this.attachEventListeners();
    }

    attachEventListeners(): void {
        if (!this.exportBtn || !this.importBtn || !this.importFileInput || !this.resetBtn) return;
        this.exportBtn.addEventListener('click', this.exportSettings.bind(this));
        this.importBtn.addEventListener('click', () => this.importFileInput?.click());
        this.importFileInput.addEventListener('change', this.importSettings.bind(this));
        this.resetBtn.addEventListener('click', this.resetSettings.bind(this));
    }

    async exportSettings(): Promise<void> {
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

    importSettings(event: Event): void {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0]; // Optional chaining safe access
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                if (!e.target?.result) throw new Error("File empty");
                const importedSettings = JSON.parse(e.target.result as string);
                // Simple validation
                if (typeof importedSettings !== 'object' || !importedSettings.hasOwnProperty('isHeuristicEngineEnabled')) {
                    throw new Error("Invalid settings file format.");
                }
                await chrome.storage.sync.set(importedSettings);
                this.showToast('Settings imported successfully! Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.showToast(`Error importing settings: ${msg}`, 'error');
            }
        };
        reader.readAsText(file);
        target.value = ''; // Reset file input
    }

    resetSettings(): void {
        if (confirm("Are you sure you want to reset all rules to their defaults? This will clear your custom hiding rules, network blocklist, and popup list.")) {
            chrome.runtime.sendMessage({ type: 'RESET_SETTINGS_TO_DEFAULTS' }, (response) => {
                // Runtime errors can be undefined
                if (response?.success) {
                    this.showToast('Settings reset successfully! Reloading...', 'success');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    this.showToast('Failed to reset settings.', 'error');
                }
            });
        }
    }
}
