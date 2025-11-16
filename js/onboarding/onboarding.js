// onboarding.js

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    const initialSetupDiv = document.getElementById('initial-setup');
    const successDiv = document.getElementById('success-message');
    const getStartedBtn = document.getElementById('get-started-btn');

    // Apply theme
    const { theme } = await chrome.storage.sync.get('theme');
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    }

    // --- Event Listeners ---
    saveApiKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            saveApiKeyBtn.disabled = true;
            saveApiKeyBtn.textContent = 'Saving...';
            
            await chrome.storage.sync.set({ geminiApiKey: apiKey });
            
            initialSetupDiv.classList.add('hidden');
            successDiv.classList.remove('hidden');
        } else {
            alert('Please enter a valid API key.');
        }
    });

    getStartedBtn.addEventListener('click', () => {
        // Open the settings page
        chrome.runtime.openOptionsPage();
        // Close the current onboarding tab
        chrome.tabs.getCurrent(tab => {
            if (tab) chrome.tabs.remove(tab.id);
        });
    });
});
