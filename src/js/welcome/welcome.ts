// src/js/welcome/welcome.ts
import { AppSettings } from '../types.js';

document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('save-start-btn') as HTMLButtonElement | null;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    const skipLink = document.getElementById('skip-link') as HTMLElement | null;

    if (!saveBtn || !apiKeyInput || !skipLink) {
        console.error('ZenithGuard: Critical elements missing in welcome page.');
        return;
    }

    // Helper to access the global toast utility
    const showToast = (msg: string, type: 'success' | 'error') => {
        if (window.ZenithGuardToastUtils && window.ZenithGuardToastUtils.showToast) {
            window.ZenithGuardToastUtils.showToast({ message: msg, type: type });
        } else {
            console.warn('Toast utility not loaded:', msg);
            if (type === 'error') alert(msg);
        }
    };

    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showToast('Please enter an API key to enable AI features.', 'error');
            return;
        }

        try {
            await chrome.storage.sync.set({ geminiApiKey: apiKey } as Partial<AppSettings>);

            // Notify background to reset client
            chrome.runtime.sendMessage({ type: 'API_KEY_UPDATED' });

            showToast('Setup complete! You are ready to go.', 'success');

            saveBtn.textContent = 'All Set!';
            saveBtn.disabled = true;

            setTimeout(() => {
                window.close();
            }, 1500);

        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Failed to save settings.', 'error');
        }
    });

    skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.close();
    });
});
