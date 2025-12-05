// privacy_insights_engine.js
import { getLatestTrackerList } from './tracker_list_updater.js';

// This is now a *fallback* for when the dynamic list is unavailable.
const HARDCODED_INSIGHT_DEFINITIONS = {
    SESSION_REPLAY: {
        domains: ['hotjar.com', 'fullstory.com', 'logrocket.com', 'inspectlet.com', 'clarity.ms'],
        generate: (domain) => ({
            type: 'warning',
            icon: 'record',
            message: `This site uses session replay scripts from <strong>${domain}</strong>, which can record your clicks and keystrokes.`
        })
    },
    DATA_BROKER: {
        domains: ['criteo.com', 'liveramp.com', 'acxiom.com', 'oracle.com', 'rlcdn.com'],
        generate: (domain) => ({
            type: 'alert',
            icon: 'database',
            message: `A connection was made to <strong>${domain}</strong>, a known data broker that collects and sells user information.`
        })
    },
    AD_EXCHANGE: {
        domains: ['adnxs.com', 'rubiconproject.com', 'openx.net', 'pubmatic.com', 'indexexchange.com'],
        generate: (domain) => ({
            type: 'alert',
            icon: 'megaphone',
            message: `This site uses the <strong>${domain}</strong> ad exchange, which shares your data across a wide network of advertisers.`
        })
    }
};

/**
 * Analyzes network logs for a given tab to generate privacy insights.
 * REFACTORED: Now fetches definitions from the dynamic list cache.
 * @param {Array} networkLog - The network log for the specific tab.
 * @returns {Promise<Array>} An array of insight objects.
 */
export async function generatePrivacyInsights(networkLog) {
    if (!networkLog || !Array.isArray(networkLog) || networkLog.length === 0) {
        return [];
    }

    // --- NEW: Load dynamic definitions ---
    let insightDefinitions = await getLatestTrackerList();
    let isHardcoded = false;
    
    if (!insightDefinitions) {
        // Fallback to hardcoded list if the dynamic one isn't loaded
        insightDefinitions = HARDCODED_INSIGHT_DEFINITIONS;
        isHardcoded = true;
    }
    // --- End new logic ---

    const insights = [];
    const foundDomains = new Set();
    const thirdPartyTrackers = new Set();

    for (const entry of networkLog) {
        try {
            const requestDomain = new URL(entry.url).hostname;
            
            // General tracker counting
            if (entry.status === 'blocked') {
                thirdPartyTrackers.add(requestDomain);
            }

            // Check against specific insight definitions
            for (const key in insightDefinitions) {
                const definition = insightDefinitions[key];
                for (const insightDomain of definition.domains) {
                    if (requestDomain.includes(insightDomain) && !foundDomains.has(insightDomain)) {
                        
                        // NEW: Generate message dynamically or use hardcoded generator
                        let insight;
                        if (isHardcoded) {
                            insight = definition.generate(insightDomain);
                        } else {
                            insight = {
                                type: key === 'DATA_BROKER' || key === 'AD_EXCHANGE' ? 'alert' : 'warning',
                                icon: key === 'SESSION_REPLAY' ? 'record' : (key === 'DATA_BROKER' ? 'database' : 'megaphone'),
                                message: definition.message.replace('{domain}', insightDomain)
                            };
                        }

                        insights.push(insight);
                        foundDomains.add(insightDomain);
                    }
                }
            }
        } catch (e) { /* ignore invalid URLs */ }
    }

    // Add a tracker density insight if applicable
    if (thirdPartyTrackers.size > 15) {
        insights.unshift({ // Add to the beginning
            type: 'info',
            icon: 'shield',
            message: `ZenithGuard blocked requests to <strong>${thirdPartyTrackers.size}</strong> unique tracking domains on this page.`
        });
    }

    return insights;
}