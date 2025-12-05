// src/js/onboarding/onboarding.ts
import { AppSettings } from '../types.js';

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null;
    const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement | null;
    const initialSetupDiv = document.getElementById('initial-setup') as HTMLElement | null;
    const successDiv = document.getElementById('success-message') as HTMLElement | null;
    const getStartedBtn = document.getElementById('get-started-btn') as HTMLElement | null;

    // Apply theme
    const state = await chrome.storage.sync.get('theme') as { theme?: string };
    if (state.theme === 'light') {
        document.body.classList.add('light-theme');
    }

    // --- Event Listeners ---
    if (saveApiKeyBtn && apiKeyInput) {
        saveApiKeyBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            if (apiKey) {
                saveApiKeyBtn.disabled = true;
                saveApiKeyBtn.textContent = 'Saving...';

                await chrome.storage.sync.set({ geminiApiKey: apiKey } as Partial<AppSettings>);

                if (initialSetupDiv) initialSetupDiv.classList.add('hidden');
                if (successDiv) successDiv.classList.remove('hidden');
            } else {
                alert('Please enter a valid API key.');
            }
        });
    }

    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            // Open the settings page
            chrome.runtime.openOptionsPage();
            // Close the current onboarding tab
            chrome.tabs.getCurrent(tab => {
                if (tab && tab.id) chrome.tabs.remove(tab.id);
            });
        });
    }
});
