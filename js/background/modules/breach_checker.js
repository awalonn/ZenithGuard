// breach_checker.js

// A curated, offline list of domains known to have had major data breaches.
// This is not exhaustive but covers many prominent examples.
export const BREACHED_DOMAINS = [
    'linkedin.com',
    'adobe.com',
    'canva.com',
    'dropbox.com',
    'myfitnesspal.com',
    'zynga.com',
    'twitter.com',
    'wattpad.com',
    'quora.com',
    'tumblr.com',
    'myheritage.com',
    'dubsmash.com',
    'verizon.com',
    'vk.com',
    'last.fm'
];

/**
 * Checks if a given domain or its parent domain is in the breach list.
 * @param {string} domain - The domain to check (e.g., 'login.adobe.com').
 * @param {string[]} breachList - The list of breached domains.
 * @returns {boolean} - True if the domain is considered breached.
 */
export function isDomainBreached(domain, breachList) {
    if (!domain) return false;
    const domainParts = domain.split('.').reverse();
    
    // Check for matches from the most specific to the least specific part of the domain.
    // e.g., for 'sub.example.co.uk', it checks:
    // 1. 'sub.example.co.uk'
    // 2. 'example.co.uk'
    // 3. 'co.uk' (unlikely to be in the list, but logic holds)
    for (let i = 0; i < domainParts.length - 1; i++) {
        const check = domainParts.slice(0, i + 2).reverse().join('.');
        if (breachList.includes(check)) {
            return true;
        }
    }
    
    return false;
}