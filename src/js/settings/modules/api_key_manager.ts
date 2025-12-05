// js/settings/modules/api_key_manager.ts
import { AppSettings } from '../../types.js';

export class ApiKeyManager {
    private hasApiKey: boolean;
    private showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    private apiKeyInput: HTMLInputElement | null;
    private saveBtn: HTMLButtonElement | null;

    constructor(syncSettings: AppSettings, showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
        this.hasApiKey = !!syncSettings.geminiApiKey;
        this.showToast = showToast;
        this.apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
        this.saveBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
    }

    initialize(): void {
        if (!this.apiKeyInput || !this.saveBtn) return;

        if (this.hasApiKey) {
            this.apiKeyInput.placeholder = '•••••••••••••••• (key saved)';
        } else {
            this.apiKeyInput.placeholder = 'Enter your Gemini API key';
        }

        this.saveBtn.addEventListener('click', async () => {
            if (!this.apiKeyInput) return;
            const raw = this.apiKeyInput.value.trim();

            if (!raw && this.hasApiKey) {
                // User didn’t type anything new; keep the existing key
                this.showToast('API key unchanged.', 'info');
                return;
            }

            if (!raw) {
                this.showToast('Please enter a valid API key.', 'error');
                return;
            }

            await chrome.storage.sync.set({ geminiApiKey: raw });
            this.showToast('API key saved successfully!', 'success');

            // Update UI state after saving
            this.hasApiKey = true;
            this.apiKeyInput.value = ''; // Clear the input field
            this.apiKeyInput.placeholder = '•••••••••••••••• (key saved)';
        });
    }
}
