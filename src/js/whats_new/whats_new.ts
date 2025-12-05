// whats_new.js

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme from storage
    const { theme } = await chrome.storage.sync.get('theme');
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    }

    // Get version from manifest
    const manifest = chrome.runtime.getManifest();
    const badge = document.getElementById('version-badge');
    if (badge) {
        badge.textContent = `v${manifest.version}`;
    }

    // Add listener to close button
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }
});
