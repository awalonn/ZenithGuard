import { DEFAULT_BLOCKLIST } from "../storage/defaults";

export type RuleMatchInfo = {
    source: string;
    category: string;
    detail: string;
    matchedValue?: string;
};

export type DnrStatus = "allowed" | "blocked" | "modified";

export const CORE_RULESET_ID = "core_protection";
export const YOUTUBE_RULESET_ID = "youtube_core";

const SURVIVAL_RULES: Array<{ id: number; matchedValue: string }> = [
    { id: 1, matchedValue: "doubleclick.net" },
    { id: 2, matchedValue: "googleads.g.doubleclick.net" },
    { id: 3, matchedValue: "pagead2.googlesyndication.com" },
];

const HEURISTIC_RULE_START_ID = 100;
const YOUTUBE_DYNAMIC_RULE_START_ID = 20_000;
const ISOLATION_MODE_RULE_START_ID = 30_000;
const NETWORK_BLOCKLIST_RULE_START_ID = 40_000;
const FOCUS_MODE_RULE_START_ID = 7_000;
const URL_CLEANER_RULE_START_ID = 50_000;
const USER_ALLOWLIST_RULE_START_ID = 60_000;
const BUILT_IN_RULE_START_ID = 80_000;
const MALWARE_RULE_START_ID = 200_000;
let dynamicRuleMetadataStore = new Map<number, RuleMatchInfo>();

function trimMatchedValue(value: string, maxLength = 120): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function createMatchInfo(
    source: string,
    category: string,
    detail: string,
    matchedValue?: string,
): RuleMatchInfo {
    return {
        source,
        category,
        detail: trimMatchedValue(detail),
        matchedValue: matchedValue ? trimMatchedValue(matchedValue) : undefined,
    };
}

function stripRuleDecorators(value: string): string {
    return value.replace(/^\|\|/, "").replace(/\^$/, "");
}

function isRuleInRange(ruleId: number, start: number, endExclusive: number): boolean {
    return ruleId >= start && ruleId < endExclusive;
}

function buildStaticRuleMetadataMap(): Map<number, RuleMatchInfo> {
    const metadata = new Map<number, RuleMatchInfo>();

    for (const rule of SURVIVAL_RULES) {
        metadata.set(
            rule.id,
            createMatchInfo(
                "Survival Rule",
                "Core",
                "Emergency built-in ad-network rule.",
                rule.matchedValue,
            ),
        );
    }

    DEFAULT_BLOCKLIST.forEach((rule, index) => {
        const ruleId = BUILT_IN_RULE_START_ID + index;
        const matchedValue = stripRuleDecorators(rule.value);
        metadata.set(
            ruleId,
            createMatchInfo(
                "Default Blocklist",
                "Core",
                `Matched default rule: ${matchedValue}`,
                matchedValue,
            ),
        );
    });

    return metadata;
}

const STATIC_RULE_METADATA = buildStaticRuleMetadataMap();

export function isManagedRuleset(rulesetId: string): boolean {
    return rulesetId === CORE_RULESET_ID || rulesetId === YOUTUBE_RULESET_ID;
}

export function setDynamicRuleMetadata(metadata: Map<number, RuleMatchInfo>): void {
    dynamicRuleMetadataStore = new Map(metadata);
}

export function clearDynamicRuleMetadata(): void {
    dynamicRuleMetadataStore = new Map();
}

export function getMatchedRuleInfo(
    ruleId: number,
    dynamicRuleMetadata: Map<number, RuleMatchInfo> = dynamicRuleMetadataStore,
): RuleMatchInfo {
    const dynamicInfo = dynamicRuleMetadata.get(ruleId);
    if (dynamicInfo) {
        return dynamicInfo;
    }

    const staticInfo = STATIC_RULE_METADATA.get(ruleId);
    if (staticInfo) {
        return staticInfo;
    }

    if (ruleId >= MALWARE_RULE_START_ID) {
        return {
            source: "Malware Protection",
            category: "Security",
            detail: "Known malware or hostile-domain redirect protection.",
        };
    }
    if (isRuleInRange(ruleId, BUILT_IN_RULE_START_ID, MALWARE_RULE_START_ID)) {
        return {
            source: "Default Blocklist",
            category: "Core",
            detail: "Built-in high-confidence network blocking rule.",
        };
    }
    if (isRuleInRange(ruleId, USER_ALLOWLIST_RULE_START_ID, BUILT_IN_RULE_START_ID)) {
        return {
            source: "User Allowlist",
            category: "User",
            detail: "Protection was intentionally paused or allowed for this site.",
        };
    }
    if (isRuleInRange(ruleId, URL_CLEANER_RULE_START_ID, USER_ALLOWLIST_RULE_START_ID)) {
        return {
            source: "URL Cleaner",
            category: "Privacy",
            detail: "Tracking-parameter sanitization rule.",
        };
    }
    if (isRuleInRange(ruleId, ISOLATION_MODE_RULE_START_ID, 40_000)) {
        return {
            source: "Isolation Mode",
            category: "Privacy",
            detail: "Third-party resources blocked for an isolation-protected site.",
        };
    }
    if (isRuleInRange(ruleId, YOUTUBE_DYNAMIC_RULE_START_ID, ISOLATION_MODE_RULE_START_ID)) {
        return {
            source: "YouTube Ads",
            category: "Media",
            detail: "YouTube-specific ad or media delivery filter.",
        };
    }
    if (isRuleInRange(ruleId, NETWORK_BLOCKLIST_RULE_START_ID, URL_CLEANER_RULE_START_ID)) {
        return {
            source: "Network Blocklist",
            category: "User",
            detail: "User-added domain block rule.",
        };
    }
    if (isRuleInRange(ruleId, FOCUS_MODE_RULE_START_ID, 8_000)) {
        return {
            source: "Focus Mode",
            category: "Productivity",
            detail: "Site blocked by focus-mode distraction controls.",
        };
    }
    if (isRuleInRange(ruleId, HEURISTIC_RULE_START_ID, FOCUS_MODE_RULE_START_ID)) {
        return {
            source: "Heuristic Engine",
            category: "Heuristic",
            detail: "Keyword-based third-party request block.",
        };
    }
    if (ruleId >= 1 && ruleId <= 3) {
        return {
            source: "Survival Rule",
            category: "Core",
            detail: "Emergency built-in ad-network rule.",
        };
    }

    return {
        source: "DNR Filter",
        category: "Core",
        detail: "Browser declarative network rule.",
    };
}

export function getDnrStatus(ruleId: number): DnrStatus {
    if (ruleId >= USER_ALLOWLIST_RULE_START_ID && ruleId < BUILT_IN_RULE_START_ID) {
        return "allowed";
    }
    if (ruleId >= URL_CLEANER_RULE_START_ID && ruleId < USER_ALLOWLIST_RULE_START_ID) {
        return "modified";
    }
    return "blocked";
}

export {
    HEURISTIC_RULE_START_ID,
    NETWORK_BLOCKLIST_RULE_START_ID,
    YOUTUBE_DYNAMIC_RULE_START_ID,
    ISOLATION_MODE_RULE_START_ID,
    FOCUS_MODE_RULE_START_ID,
    URL_CLEANER_RULE_START_ID,
    USER_ALLOWLIST_RULE_START_ID,
    BUILT_IN_RULE_START_ID,
    MALWARE_RULE_START_ID,
};
