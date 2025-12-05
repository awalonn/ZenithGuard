// privacy_insights_engine.ts
import { getLatestTrackerList } from './tracker_list_updater.js';

interface Insight {
    type: 'warning' | 'alert' | 'info';
    icon: string;
    message: string;
}

interface Definition {
    domains: string[];
    generate: (domain: string) => Insight;
    message?: string; // For dynamic definitions
}

interface DynamicDefinition {
    domains: string[];
    message: string;
}

interface NetworkLogEntry {
    url: string;
    status: string;
}

// This is now a *fallback* for when the dynamic list is unavailable.
const HARDCODED_INSIGHT_DEFINITIONS: Record<string, Definition> = {
    SESSION_REPLAY: {
        domains: ['hotjar.com', 'fullstory.com', 'logrocket.com', 'inspectlet.com', 'clarity.ms'],
        generate: (domain: string) => ({
            type: 'warning',
            icon: 'record',
            message: `This site uses session replay scripts from <strong>${domain}</strong>, which can record your clicks and keystrokes.`
        })
    },
    DATA_BROKER: {
        domains: ['criteo.com', 'liveramp.com', 'acxiom.com', 'oracle.com', 'rlcdn.com'],
        generate: (domain: string) => ({
            type: 'alert',
            icon: 'database',
            message: `A connection was made to <strong>${domain}</strong>, a known data broker that collects and sells user information.`
        })
    },
    AD_EXCHANGE: {
        domains: ['adnxs.com', 'rubiconproject.com', 'openx.net', 'pubmatic.com', 'indexexchange.com'],
        generate: (domain: string) => ({
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
export async function generatePrivacyInsights(networkLog: NetworkLogEntry[]): Promise<Insight[]> {
    if (!networkLog || !Array.isArray(networkLog) || networkLog.length === 0) {
        return [];
    }

    // --- NEW: Load dynamic definitions ---
    // The tracker list updater returns a specific structure, assuming map of key -> DynamicDefinition
    let insightDefinitions = await getLatestTrackerList() as Record<string, DynamicDefinition> | null;
    let isHardcoded = false;

    if (!insightDefinitions) {
        // Fallback to hardcoded list if the dynamic one isn't loaded
        // We cast this to any or specific union because structure differs slightly (generate vs message)
        insightDefinitions = HARDCODED_INSIGHT_DEFINITIONS as any;
        isHardcoded = true;
    }
    // --- End new logic ---

    const insights: Insight[] = [];
    const foundDomains = new Set<string>();
    const thirdPartyTrackers = new Set<string>();

    for (const entry of networkLog) {
        try {
            const requestDomain = new URL(entry.url).hostname;

            // General tracker counting
            if (entry.status === 'blocked') {
                thirdPartyTrackers.add(requestDomain);
            }

            // Check against specific insight definitions
            if (insightDefinitions) {
                for (const key in insightDefinitions) {
                    const definition = insightDefinitions[key];
                    for (const insightDomain of definition.domains) {
                        if (requestDomain.includes(insightDomain) && !foundDomains.has(insightDomain)) {

                            // NEW: Generate message dynamically or use hardcoded generator
                            let insight: Insight;
                            if (isHardcoded) {
                                // We know it's the hardcoded definition with 'generate'
                                insight = (definition as unknown as Definition).generate(insightDomain);
                            } else {
                                // Dynamic definition uses 'message' template
                                const dynamicDef = definition as DynamicDefinition;
                                insight = {
                                    type: key === 'DATA_BROKER' || key === 'AD_EXCHANGE' ? 'alert' : 'warning',
                                    icon: key === 'SESSION_REPLAY' ? 'record' : (key === 'DATA_BROKER' ? 'database' : 'megaphone'),
                                    message: dynamicDef.message.replace('{domain}', insightDomain)
                                };
                            }

                            insights.push(insight);
                            foundDomains.add(insightDomain);
                        }
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