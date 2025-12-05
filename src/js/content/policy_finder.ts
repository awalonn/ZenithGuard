// policy_finder.js
// This script runs on page load to find the privacy policy URL.

(async () => {
    // Keywords to look for in link text
    const keywords = ['privacy policy', 'privacy', 'data policy'];

    // Find all links on the page
    const links = Array.from(document.getElementsByTagName('a'));

    let policyLink = null;

    for (const link of links) {
        const linkText = link.textContent.trim().toLowerCase();
        if (keywords.some(keyword => linkText.includes(keyword))) {
            if (link.href) {
                policyLink = link;
                break; // Found a likely candidate, stop searching
            }
        }
    }

    if (policyLink) {
        try {
            // Ensure the URL is absolute
            const absoluteUrl = new URL(policyLink.href, window.location.href).href;
            
            // Send the URL to the background script.
            // This is a fire-and-forget message, but we add a .catch() to suppress
            // "Receiving end does not exist" errors if the service worker is not ready.
            chrome.runtime.sendMessage({
                type: 'FOUND_PRIVACY_POLICY_URL',
                data: {
                    domain: window.location.hostname,
                    policyUrl: absoluteUrl
                }
            }).catch(error => {
                console.warn(`ZenithGuard: Could not send policy URL. Background service might be reloading. Error: ${error.message}`);
            });
            
        } catch (e) {
             console.error("ZenithGuard Policy Finder: Error processing link.", e);
        }
    }
})();