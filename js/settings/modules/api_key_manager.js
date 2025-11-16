// js/settings/modules/api_key_manager.js
export class ApiKeyManager {
    constructor(syncSettings, showToast) {
        this.hasApiKey = !!syncSettings.geminiApiKey;
        this.showToast = showToast;
        this.apiKeyInput = document.getElementById('api-key-input');
        this.saveBtn = document.getElementById('save-api-key-btn');
    }

    initialize() {
        if (this.hasApiKey) {
            this.apiKeyInput.placeholder = '•••••••••••••••• (key saved)';
        } else {
            this.apiKeyInput.placeholder = 'Enter your Gemini API key';
        }

        this.saveBtn.addEventListener('click', async () => {
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
