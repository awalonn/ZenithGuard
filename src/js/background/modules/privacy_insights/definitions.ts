import { getCachedTrackerDefinitions } from "../tracker_metadata_cache";

export type InsightSeverity = "info" | "warning" | "alert";
export type InsightIcon = "record" | "database" | "megaphone" | "shield" | "brain";

export type PrivacyInsight = {
    type: InsightSeverity;
    icon: InsightIcon;
    message: string;
};

export type GeneratorInsightDefinition = {
    domains: string[];
    generate: (domain: string) => PrivacyInsight;
};

export type MessageInsightDefinition = {
    domains: string[];
    message: string;
};

export type InsightDefinition = GeneratorInsightDefinition | MessageInsightDefinition;

export type InsightDefinitions = Record<string, InsightDefinition>;

const HARDCODED_INSIGHT_DEFINITIONS: InsightDefinitions = {
    SESSION_REPLAY: {
        domains: ["hotjar.com", "fullstory.com", "logrocket.com", "inspectlet.com", "clarity.ms"],
        generate: (domain) => ({
            type: "warning",
            icon: "record",
            message: `This site uses session replay scripts from <strong>${domain}</strong>, which can record your clicks and keystrokes.`,
        }),
    },
    DATA_BROKER: {
        domains: ["criteo.com", "liveramp.com", "acxiom.com", "oracle.com", "rlcdn.com"],
        generate: (domain) => ({
            type: "alert",
            icon: "database",
            message: `A connection was made to <strong>${domain}</strong>, a known data broker that collects and sells user information.`,
        }),
    },
    AD_EXCHANGE: {
        domains: ["adnxs.com", "rubiconproject.com", "openx.net", "pubmatic.com", "indexexchange.com"],
        generate: (domain) => ({
            type: "alert",
            icon: "megaphone",
            message: `This site uses the <strong>${domain}</strong> ad exchange, which shares your data across a wide network of advertisers.`,
        }),
    },
};

function toMessageDefinitions(definitions: unknown): Record<string, MessageInsightDefinition> {
    const mapped: Record<string, MessageInsightDefinition> = {};
    if (!definitions || typeof definitions !== "object") {
        return mapped;
    }

    for (const [key, value] of Object.entries(definitions)) {
        if (!value || typeof value !== "object") {
            continue;
        }

        const candidate = value as { domains?: unknown; message?: unknown };
        if (!Array.isArray(candidate.domains) || typeof candidate.message !== "string") {
            continue;
        }

        mapped[key] = {
            domains: candidate.domains.filter((entry): entry is string => typeof entry === "string"),
            message: candidate.message,
        };
    }

    return mapped;
}

export async function getTrackerInsightDefinitions(): Promise<{
    definitions: InsightDefinitions;
    isHardcoded: boolean;
}> {
    const cachedDefinitions = await getCachedTrackerDefinitions();
    if (cachedDefinitions) {
        const mapped = toMessageDefinitions(cachedDefinitions);
        if (Object.keys(mapped).length > 0) {
            return {
                definitions: mapped,
                isHardcoded: false,
            };
        }
    }

    return {
        definitions: HARDCODED_INSIGHT_DEFINITIONS,
        isHardcoded: true,
    };
}

function getSeverityForCategory(category: string): InsightSeverity {
    return category === "DATA_BROKER" || category === "AD_EXCHANGE" ? "alert" : "warning";
}

function getIconForCategory(category: string): InsightIcon {
    if (category === "SESSION_REPLAY") {
        return "record";
    }
    if (category === "DATA_BROKER") {
        return "database";
    }
    return "megaphone";
}

export function createDomainInsight(
    category: string,
    definition: InsightDefinition,
    domain: string,
    isHardcoded: boolean,
): PrivacyInsight {
    if ("generate" in definition && isHardcoded) {
        return definition.generate(domain);
    }

    const messageDefinition = definition as MessageInsightDefinition;
    return {
        type: getSeverityForCategory(category),
        icon: getIconForCategory(category),
        message: messageDefinition.message.replace("{domain}", domain),
    };
}

export function createTrackerCountInsight(uniqueTrackerCount: number): PrivacyInsight {
    return {
        type: "info",
        icon: "shield",
        message: `ZenithGuard blocked requests to <strong>${uniqueTrackerCount}</strong> unique tracking domains on this page.`,
    };
}

export function createLocalAiTrackerInsight(domain: string): PrivacyInsight {
    return {
        type: "alert",
        icon: "brain",
        message: `Local AI identified <strong>${domain}</strong> as a high-probability advertising tracker.`,
    };
}

export function createGeminiTrackerSummary(summary: string): PrivacyInsight {
    return {
        type: "info",
        icon: "brain",
        message: `<strong>AI Threat Report:</strong> ${summary}`,
    };
}
