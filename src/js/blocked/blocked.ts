// blocked.js

document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('back-btn');

    backBtn?.addEventListener('click', () => {
        // This is the most reliable way to go back from a blocked page.
        window.history.back();
    });

    // The "Proceed Anyway" functionality has been removed because it is not
    // reliably supported by the declarativeNetRequest API when using the
    // high-performance `requestDomains` condition for blocking. This simplifies
    // the page and removes buggy behavior.
});