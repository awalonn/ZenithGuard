import { getAiHandlerModule } from "../ai_handler";
import { hostnamesMatch } from "../../../shared/hostname_matching";
import {
    canUseLocalAiTrackerInsights,
    classifyTrackerDomainWithLocalAi,
    summarizeNetworkLogWithGemini,
} from "../message_actions/ai_actions";
import {
    createDomainInsight,
    createGeminiTrackerSummary,
    createLocalAiTrackerInsight,
    createTrackerCountInsight,
    getTrackerInsightDefinitions,
    type InsightDefinition,
    type PrivacyInsight,
} from "./definitions";

type NetworkLogEntry = {
    url: string;
    status: string;
    type?: string;
};

const LOCAL_AI_CACHE_TTL_MS = 30 * 60 * 1000;
const LOCAL_AI_MIN_TRACKER_COUNT = 2;
const LOCAL_AI_SAMPLE_LIMIT = 3;
const LARGE_TRACKER_COUNT_THRESHOLD = 15;
const LOCAL_AI_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const LOCAL_AI_ATTEMPT_CAP = 500;

const inFlightLocalAiAttempts = new Map<string, { inFlight: boolean; lastAttemptAt: number }>();

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function pruneLocalAiAttempts(now: number): void {
    for (const [key, entry] of inFlightLocalAiAttempts) {
        if (!entry.inFlight && now - entry.lastAttemptAt > LOCAL_AI_ATTEMPT_WINDOW_MS) {
            inFlightLocalAiAttempts.delete(key);
        }
    }

    while (inFlightLocalAiAttempts.size > LOCAL_AI_ATTEMPT_CAP) {
        const [oldestKey] = inFlightLocalAiAttempts.keys();
        if (!oldestKey) {
            break;
        }
        const entry = inFlightLocalAiAttempts.get(oldestKey);
        if (!entry?.inFlight) {
            inFlightLocalAiAttempts.delete(oldestKey);
            continue;
        }
        break;
    }
}

function canAttemptLocalAi(domain: string, now = Date.now()): boolean {
    const existing = inFlightLocalAiAttempts.get(domain);
    if (existing && (existing.inFlight || now - existing.lastAttemptAt < LOCAL_AI_ATTEMPT_WINDOW_MS)) {
        return false;
    }

    pruneLocalAiAttempts(now);
    if (!existing && inFlightLocalAiAttempts.size >= LOCAL_AI_ATTEMPT_CAP) {
        return false;
    }

    inFlightLocalAiAttempts.set(domain, { inFlight: true, lastAttemptAt: now });
    return true;
}

function markLocalAiAttemptComplete(domain: string): void {
    const existing = inFlightLocalAiAttempts.get(domain);
    if (existing) {
        existing.inFlight = false;
        existing.lastAttemptAt = Date.now();
        inFlightLocalAiAttempts.set(domain, existing);
    }
}

function collectDefinitionInsights(
    networkLog: NetworkLogEntry[],
    definitions: Record<string, InsightDefinition>,
    isHardcoded: boolean,
): {
    insights: PrivacyInsight[];
    foundDomains: Set<string>;
    blockedThirdPartyDomains: Set<string>;
} {
    const insights: PrivacyInsight[] = [];
    const foundDomains = new Set<string>();
    const blockedThirdPartyDomains = new Set<string>();

    for (const entry of networkLog) {
        const hostname = getHostname(entry.url);
        if (!hostname) {
            continue;
        }

        if (entry.status === "blocked") {
            blockedThirdPartyDomains.add(hostname);
        }

        for (const [category, definition] of Object.entries(definitions)) {
            for (const domain of definition.domains) {
                const normalizedDomain = String(domain || "").trim().toLowerCase();
                if (!normalizedDomain || !hostnamesMatch(hostname, normalizedDomain) || foundDomains.has(normalizedDomain)) {
                    continue;
                }

                insights.push(createDomainInsight(category, definition, normalizedDomain, isHardcoded));
                foundDomains.add(normalizedDomain);
            }
        }
    }

    return { insights, foundDomains, blockedThirdPartyDomains };
}

async function maybeCreateLocalAiInsight(
    pageDomain: string,
    blockedThirdPartyDomains: Set<string>,
    foundDomains: Set<string>,
): Promise<PrivacyInsight | null> {
    if (!canUseLocalAiTrackerInsights() || !canAttemptLocalAi(pageDomain)) {
        return null;
    }

    try {
        const candidates = Array.from(blockedThirdPartyDomains).filter((domain) => !foundDomains.has(domain));
        if (candidates.length < LOCAL_AI_MIN_TRACKER_COUNT) {
            return null;
        }

        for (const domain of candidates.slice(0, LOCAL_AI_SAMPLE_LIMIT)) {
            try {
                const result = await classifyTrackerDomainWithLocalAi(domain, `Domain: ${domain}`, {
                    cacheTtlMs: LOCAL_AI_CACHE_TTL_MS,
                    enforceGate: false,
                    minTextLength: 1,
                });
                if (result?.isAdRelated && result.confidence > 0.8) {
                    return createLocalAiTrackerInsight(domain);
                }
            } catch (error) {
                console.warn("ZenithGuard: Local AI Insight unavailable for domain", domain, error);
            }
        }

        return null;
    } finally {
        markLocalAiAttemptComplete(pageDomain);
    }
}

export async function buildPrivacyInsights(
    networkLog: NetworkLogEntry[],
    domain = "Unknown",
): Promise<PrivacyInsight[]> {
    if (!Array.isArray(networkLog) || networkLog.length === 0) {
        return [];
    }

    const { definitions, isHardcoded } = await getTrackerInsightDefinitions();
    const { insights, foundDomains, blockedThirdPartyDomains } = collectDefinitionInsights(networkLog, definitions, isHardcoded);

    if (blockedThirdPartyDomains.size > LARGE_TRACKER_COUNT_THRESHOLD) {
        insights.unshift(createTrackerCountInsight(blockedThirdPartyDomains.size));
    }

    const [localAiInsight, geminiSummary] = await Promise.all([
        maybeCreateLocalAiInsight(domain, blockedThirdPartyDomains, foundDomains),
        summarizeNetworkLogWithGemini(getAiHandlerModule, networkLog, domain),
    ]);

    if (geminiSummary) {
        insights.unshift(createGeminiTrackerSummary(geminiSummary));
    }
    if (localAiInsight) {
        insights.push(localAiInsight);
    }

    return insights;
}
