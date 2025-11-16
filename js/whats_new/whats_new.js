// whats_new.js

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme from storage
    const { theme } = await chrome.storage.sync.get('theme');
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    }

    // Get version from manifest
    const manifest = chrome.runtime.getManifest();
    document.getElementById('version-badge').textContent = `v${manifest.version}`;

    // Add listener to close button
    document.getElementById('close-btn').addEventListener('click', () => {
        window.close();
    });
});
