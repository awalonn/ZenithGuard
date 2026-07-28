export type LogStatus = "allowed" | "blocked" | "modified" | string;

export type LogEntry = {
    status: LogStatus;
    matchedRuleInfo?: {
        source?: string;
        category?: string;
    };
};

export type RuleFamily =
    | "ai"
    | "user"
    | "privacy"
    | "security"
    | "media"
    | "productivity"
    | "built-in";

function hasMatchingStatus(entry: LogEntry, statuses: string[]): boolean {
    return statuses.includes(entry.status);
}

export function getRuleFamily(entry: LogEntry): RuleFamily {
    const source = entry.matchedRuleInfo?.source || "";
    const category = entry.matchedRuleInfo?.category || "";

    if (source === "AI Dynamic Rule" || category === "AI") {
        return "ai";
    }
    if (source === "Network Blocklist" || source === "User Allowlist" || category === "User") {
        return "user";
    }
    if (source === "URL Cleaner" || category === "Privacy") {
        return "privacy";
    }
    if (source === "Malware Protection" || category === "Security") {
        return "security";
    }
    if (source === "YouTube Ads" || category === "Media") {
        return "media";
    }
    if (source === "Focus Mode" || category === "Productivity") {
        return "productivity";
    }
    return "built-in";
}

export function getRuleFamilyLabel(family: RuleFamily): string {
    switch (family) {
        case "ai":
            return "AI";
        case "user":
            return "User";
        case "privacy":
            return "Privacy";
        case "security":
            return "Security";
        case "media":
            return "Media";
        case "productivity":
            return "Focus";
        default:
            return "Built-in";
    }
}

export function getTopRuleFamilies(
    entries: LogEntry[],
    limit = 3,
    statuses: string[] = ["blocked", "modified"],
): Array<[RuleFamily, number]> {
    const counts = entries.reduce((map, entry) => {
        if (!hasMatchingStatus(entry, statuses)) {
            return map;
        }

        const family = getRuleFamily(entry);
        map.set(family, (map.get(family) || 0) + 1);
        return map;
    }, new Map<RuleFamily, number>());

    return Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit);
}

export function getTopMatchedSources(
    entries: LogEntry[],
    limit = 4,
    statuses: string[] = ["blocked", "modified"],
): Array<[string, number]> {
    const counts = entries.reduce((map, entry) => {
        if (!hasMatchingStatus(entry, statuses)) {
            return map;
        }

        const source = entry.matchedRuleInfo?.source;
        if (source) {
            map.set(source, (map.get(source) || 0) + 1);
        }
        return map;
    }, new Map<string, number>());

    return Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit);
}
