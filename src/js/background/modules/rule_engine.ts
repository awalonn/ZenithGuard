import { getLocal, getSession, getSync } from "../../shared/storage_api";
import { listHasMatchingHostname } from "../../shared/hostname_matching";
import { getDynamicYoutubeRuleOverrides } from "./youtube_rules_cache";
import { getMergedMalwareDomains } from "./malware_feed";
import {
    BUILT_IN_RULE_START_ID,
    CORE_RULESET_ID,
    HEURISTIC_RULE_START_ID,
    ISOLATION_MODE_RULE_START_ID,
    MALWARE_RULE_START_ID,
    NETWORK_BLOCKLIST_RULE_START_ID,
    USER_ALLOWLIST_RULE_START_ID,
    YOUTUBE_DYNAMIC_RULE_START_ID,
    YOUTUBE_RULESET_ID,
    setDynamicRuleMetadata,
    clearDynamicRuleMetadata,
    type RuleMatchInfo,
} from "./network_logger/dnr_pipeline";
import {
    DEFAULT_BLOCKLIST,
    createFocusModeRules,
    normalizeDomain,
    type ToggleableRule,
} from "./storage/defaults";

const HEURISTIC_REGEX_MAX_LENGTH = 90;
const HEURISTIC_MAX_TERMS_PER_RULE = 8;
const DNR = {
    MAIN_FRAME: "main_frame" as chrome.declarativeNetRequest.ResourceType,
    SUB_FRAME: "sub_frame" as chrome.declarativeNetRequest.ResourceType,
    SCRIPT: "script" as chrome.declarativeNetRequest.ResourceType,
    XMLHTTPREQUEST: "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
    IMAGE: "image" as chrome.declarativeNetRequest.ResourceType,
    MEDIA: "media" as chrome.declarativeNetRequest.ResourceType,
    STYLESHEET: "stylesheet" as chrome.declarativeNetRequest.ResourceType,
    OTHER: "other" as chrome.declarativeNetRequest.ResourceType,
    WEBSOCKET: "websocket" as chrome.declarativeNetRequest.ResourceType,
    OBJECT: "object" as chrome.declarativeNetRequest.ResourceType,
};
const ALL_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.MAIN_FRAME,
    DNR.SUB_FRAME,
    DNR.SCRIPT,
    DNR.XMLHTTPREQUEST,
    DNR.IMAGE,
    DNR.MEDIA,
    DNR.STYLESHEET,
    DNR.OTHER,
    DNR.WEBSOCKET,
];
const ALL_RESOURCE_TYPES_WITH_OBJECT: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.MAIN_FRAME,
    DNR.SUB_FRAME,
    DNR.SCRIPT,
    DNR.XMLHTTPREQUEST,
    DNR.IMAGE,
    DNR.MEDIA,
    DNR.WEBSOCKET,
    DNR.OTHER,
];
const HEURISTIC_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.SCRIPT,
    DNR.XMLHTTPREQUEST,
    DNR.SUB_FRAME,
    DNR.WEBSOCKET,
    DNR.OTHER,
];
const ISOLATION_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.SCRIPT,
    DNR.OBJECT,
    DNR.SUB_FRAME,
];
const YOUTUBE_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.XMLHTTPREQUEST,
    DNR.SCRIPT,
    DNR.SUB_FRAME,
    DNR.OTHER,
    DNR.IMAGE,
    DNR.MEDIA,
];
const URL_FILTER_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
    DNR.XMLHTTPREQUEST,
    DNR.SCRIPT,
    DNR.SUB_FRAME,
    DNR.OTHER,
];
const MALWARE_RULE_CHUNK_SIZE = 4_000;
const USER_ALLOWLIST_RULES_PER_SITE = 3;

type RuleSettingsSnapshot = {
    isHeuristicEngineEnabled?: boolean;
    heuristicKeywords?: ToggleableRule[];
    heuristicAllowlist?: ToggleableRule[];
    networkBlocklist?: Array<ToggleableRule | string>;
    defaultBlocklist?: Array<ToggleableRule | string>;
    disabledSites?: string[];
    isUrlCleanerEnabled?: boolean;
    isMalwareProtectionEnabled?: boolean;
    isolationModeSites?: Array<ToggleableRule | string>;
    isYouTubeAdBlockingEnabled?: boolean;
    isProtectionEnabled?: boolean;
};

type RuleLike = ToggleableRule | string | null | undefined;

function stripRuleDecorators(value: string): string {
    return value.replace(/^\|\|/, "").replace(/\^+$/, "").trim().toLowerCase();
}

function getStaticCoreRuleLookupKeys(value: string): string[] {
    const stripped = stripRuleDecorators(value);
    const normalizedDomain = normalizeDomain(value) || normalizeDomain(stripped);
    return Array.from(new Set([
        value.trim().toLowerCase(),
        stripped,
        normalizedDomain || "",
    ].filter(Boolean)));
}

function truncate(value: string, maxLength = 120): string {
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
        detail: truncate(detail),
        matchedValue: matchedValue ? truncate(matchedValue) : undefined,
    };
}

function getRuleValue(rule: RuleLike): string | null {
    if (typeof rule === "string") {
        return rule.trim() || null;
    }

    if (rule && typeof rule === "object" && typeof rule.value === "string") {
        return rule.value.trim() || null;
    }

    return null;
}

function isRuleEnabled(rule: RuleLike): boolean {
    if (typeof rule === "string") {
        return Boolean(rule.trim());
    }

    return Boolean(rule && typeof rule === "object" && typeof rule.value === "string" && rule.enabled !== false);
}

function normalizeEnabledDomains(rules: RuleLike[] | undefined): string[] {
    return (rules || [])
        .filter(isRuleEnabled)
        .map((rule) => {
            const value = getRuleValue(rule);
            return value ? normalizeDomain(value) : null;
        })
        .filter((value): value is string => Boolean(value));
}

function normalizeDisabledSites(sites: string[] | undefined): string[] {
    return (sites || [])
        .map((site) => normalizeDomain(site))
        .filter((value): value is string => Boolean(value));
}

function normalizeAllowlistedSites(sites: string[] | undefined): string[] {
    const normalized: string[] = [];
    for (const site of sites || []) {
        const candidate = normalizeDomain(site);
        if (!candidate || listHasMatchingHostname(normalized, candidate)) {
            continue;
        }
        normalized.push(candidate);
    }
    return normalized;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function heuristicFragment(value: string): string {
    const escaped = escapeRegex(value);
    if (/[/?=&]/.test(value)) {
        return escaped;
    }
    if (/^[a-z0-9.-]+$/i.test(value) || /^[a-z0-9-]+$/i.test(value)) {
        return `(?:^|[/?#._=-])${escaped}(?:[/?#._=-]|$)`;
    }
    return escaped;
}

function chunkHeuristicKeywords(keywords: ToggleableRule[] | undefined): Array<{ keywords: string[]; regexFilter: string }> {
    const enabledKeywords = (keywords || [])
        .filter(isRuleEnabled)
        .map((rule) => String(rule.value || "").trim())
        .filter(Boolean)
        .map((raw) => ({ raw, fragment: heuristicFragment(raw) }))
        .filter((entry) => entry.fragment.length <= HEURISTIC_REGEX_MAX_LENGTH);

    const chunks: Array<{ keywords: string[]; regexFilter: string }> = [];
    let current: Array<{ raw: string; fragment: string }> = [];
    let currentLength = 0;

    for (const entry of enabledKeywords) {
        const wouldOverflowLength = currentLength > 0 && currentLength + entry.fragment.length + 1 > HEURISTIC_REGEX_MAX_LENGTH;
        const wouldOverflowCount = current.length >= HEURISTIC_MAX_TERMS_PER_RULE;

        if (wouldOverflowLength || wouldOverflowCount) {
            chunks.push({
                keywords: current.map((item) => item.raw),
                regexFilter: current.map((item) => item.fragment).join("|"),
            });
            current = [entry];
            currentLength = entry.fragment.length;
            continue;
        }

        if (currentLength > 0) {
            currentLength += 1;
        }
        current.push(entry);
        currentLength += entry.fragment.length;
    }

    if (current.length > 0) {
        chunks.push({
            keywords: current.map((item) => item.raw),
            regexFilter: current.map((item) => item.fragment).join("|"),
        });
    }

    return chunks;
}

export function buildUserAllowlistRules(allowlistedSites: string[]): chrome.declarativeNetRequest.Rule[] {
    let nextRuleId = USER_ALLOWLIST_RULE_START_ID;
    const rules: chrome.declarativeNetRequest.Rule[] = [];

    for (const site of allowlistedSites) {
        const domains = site.startsWith("www.") ? [site, site.replace(/^www\./, "")] : [site, `www.${site}`];
        rules.push({
            id: nextRuleId++,
            priority: 1_000,
            action: { type: "allowAllRequests" },
            condition: {
                requestDomains: domains,
                resourceTypes: [DNR.MAIN_FRAME, DNR.SUB_FRAME],
            },
        });
        rules.push({
            id: nextRuleId++,
            priority: 999,
            action: { type: "allow" },
            condition: {
                requestDomains: domains,
                resourceTypes: ALL_RESOURCE_TYPES,
            },
        });
        rules.push({
            id: nextRuleId++,
            priority: 999,
            action: { type: "allow" },
            condition: {
                initiatorDomains: domains,
                resourceTypes: ALL_RESOURCE_TYPES,
            },
        });
    }

    return rules;
}

export function buildIsolationModeRules(rules: Array<ToggleableRule | string> | undefined): chrome.declarativeNetRequest.Rule[] {
    return normalizeEnabledDomains(rules)
        .map((domain, index) => ({
            id: ISOLATION_MODE_RULE_START_ID + index,
            priority: 1,
            action: { type: "block" },
            condition: {
                initiatorDomains: domain.startsWith("www.")
                    ? [domain, domain.replace(/^www\./, "")]
                    : [domain, `www.${domain}`],
                domainType: "thirdParty",
                resourceTypes: ISOLATION_RESOURCE_TYPES,
            },
        }));
}

function buildHeuristicRules(
    keywords: ToggleableRule[] | undefined,
    allowlist: ToggleableRule[] | undefined,
    disabledSites: string[],
): chrome.declarativeNetRequest.Rule[] {
    const chunks = chunkHeuristicKeywords(keywords);
    if (chunks.length === 0) {
        return [];
    }

    const excludedInitiatorDomains = [
        ...normalizeEnabledDomains(allowlist),
        ...disabledSites,
    ];

    return chunks.map((chunk, index) => ({
        id: HEURISTIC_RULE_START_ID + index,
        priority: 2,
        action: { type: "block" },
        condition: {
            regexFilter: chunk.regexFilter,
            domainType: "thirdParty",
            resourceTypes: HEURISTIC_RESOURCE_TYPES,
            excludedInitiatorDomains: excludedInitiatorDomains.length > 0 ? excludedInitiatorDomains : undefined,
        },
    }));
}

function buildNetworkBlocklistRules(rules: Array<ToggleableRule | string> | undefined): chrome.declarativeNetRequest.Rule[] {
    return normalizeEnabledDomains(rules)
        .map((domain, index) => ({
            id: NETWORK_BLOCKLIST_RULE_START_ID + index,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: `||${domain}^`,
                resourceTypes: ALL_RESOURCE_TYPES_WITH_OBJECT,
            },
        }));
}

function buildYoutubeDynamicRules(payload: Awaited<ReturnType<typeof getDynamicYoutubeRuleOverrides>>): chrome.declarativeNetRequest.Rule[] {
    if (!payload) {
        return [];
    }

    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let offset = 0;

    for (const regexFilter of payload.regexFilters || []) {
        rules.push({
            id: YOUTUBE_DYNAMIC_RULE_START_ID + offset++,
            priority: 2,
            action: { type: "block" },
            condition: {
                regexFilter,
                resourceTypes: URL_FILTER_RESOURCE_TYPES,
            },
        });
    }

    for (const urlFilter of payload.urlFilters || []) {
        rules.push({
            id: YOUTUBE_DYNAMIC_RULE_START_ID + offset++,
            priority: 2,
            action: { type: "block" },
            condition: {
                urlFilter,
                resourceTypes: YOUTUBE_RESOURCE_TYPES,
            },
        });
    }

    return rules;
}

export function buildMalwareRules(
    domains: string[],
    disabledSites: string[],
    budget: number,
): chrome.declarativeNetRequest.Rule[] {
    if (domains.length === 0 || budget <= 0) {
        return [];
    }

    const rules: chrome.declarativeNetRequest.Rule[] = [];
    const blockedPageUrl = chrome.runtime.getURL("src/pages/blocked.html");

    for (let index = 0; index < domains.length; index += MALWARE_RULE_CHUNK_SIZE) {
        if (rules.length >= budget) {
            console.warn(`ZenithGuard: Malware protection rule budget (${budget}) reached. Not all malware domains will be loaded.`);
            break;
        }

        const chunk = domains.slice(index, index + MALWARE_RULE_CHUNK_SIZE);
        rules.push({
            id: MALWARE_RULE_START_ID + rules.length,
            priority: 1,
            action: {
                type: "redirect",
                redirect: { url: blockedPageUrl },
            },
            condition: {
                requestDomains: chunk,
                resourceTypes: ["main_frame"],
                excludedInitiatorDomains: disabledSites.length > 0 ? disabledSites : undefined,
                excludedRequestDomains: disabledSites.length > 0 ? disabledSites : undefined,
            },
        });
    }

    return rules;
}

function buildDisabledCoreRuleIds(defaultBlocklist: Array<ToggleableRule | string> | undefined): number[] {
    const ruleIdsByLookupKey = new Map<string, number>();
    DEFAULT_BLOCKLIST.forEach((rule, index) => {
        for (const key of getStaticCoreRuleLookupKeys(rule.value)) {
            ruleIdsByLookupKey.set(key, BUILT_IN_RULE_START_ID + index);
        }
    });

    const disabledRuleIds = new Set<number>();
    for (const rule of defaultBlocklist || []) {
        if (typeof rule !== "object" || !rule || rule.enabled !== false) {
            continue;
        }

        const value = getRuleValue(rule);
        if (!value) {
            continue;
        }

        for (const key of getStaticCoreRuleLookupKeys(value)) {
            const ruleId = ruleIdsByLookupKey.get(key);
            if (typeof ruleId === "number") {
                disabledRuleIds.add(ruleId);
                break;
            }
        }
    }

    return Array.from(disabledRuleIds).sort((left, right) => left - right);
}

async function syncCoreRulesetState(enabled: boolean, defaultBlocklist: Array<ToggleableRule | string> | undefined): Promise<void> {
    const [enabledRulesets, disabledRuleIds] = await Promise.all([
        chrome.declarativeNetRequest.getEnabledRulesets(),
        chrome.declarativeNetRequest.getDisabledRuleIds({ rulesetId: CORE_RULESET_ID }),
    ]);

    const shouldDisableRuleIds = buildDisabledCoreRuleIds(defaultBlocklist);
    const isCoreRulesetEnabled = enabledRulesets.includes(CORE_RULESET_ID);

    if (isCoreRulesetEnabled !== enabled) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: enabled ? [CORE_RULESET_ID] : [],
            disableRulesetIds: enabled ? [] : [CORE_RULESET_ID],
        });
    }

    const sortedCurrent = [...disabledRuleIds].sort((left, right) => left - right);
    const sameDisabledSet = sortedCurrent.length === shouldDisableRuleIds.length
        && sortedCurrent.every((value, index) => value === shouldDisableRuleIds[index]);

    if (!sameDisabledSet) {
        await chrome.declarativeNetRequest.updateStaticRules({
            rulesetId: CORE_RULESET_ID,
            disableRuleIds: shouldDisableRuleIds.filter((ruleId) => !sortedCurrent.includes(ruleId)),
            enableRuleIds: sortedCurrent.filter((ruleId) => !shouldDisableRuleIds.includes(ruleId)),
        });
    }
}

async function syncYoutubeRulesetState(enabled: boolean): Promise<void> {
    const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
    const isEnabled = enabledRulesets.includes(YOUTUBE_RULESET_ID);

    if (isEnabled === enabled) {
        return;
    }

    await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabled ? [YOUTUBE_RULESET_ID] : [],
        disableRulesetIds: enabled ? [] : [YOUTUBE_RULESET_ID],
    });
}

type BudgetedRulePushResult = {
    addedRules: chrome.declarativeNetRequest.Rule[];
    remainingBudget: number;
};

function pushRulesWithinBudget(
    target: chrome.declarativeNetRequest.Rule[],
    additions: chrome.declarativeNetRequest.Rule[],
    remainingBudget: number,
): BudgetedRulePushResult {
    if (remainingBudget <= 0 || additions.length === 0) {
        return {
            addedRules: [],
            remainingBudget,
        };
    }

    const allowedRules = additions.slice(0, remainingBudget);
    target.push(...allowedRules);
    return {
        addedRules: allowedRules,
        remainingBudget: remainingBudget - allowedRules.length,
    };
}

function pushRuleGroupsWithinBudget(
    target: chrome.declarativeNetRequest.Rule[],
    additions: chrome.declarativeNetRequest.Rule[],
    remainingBudget: number,
    groupSize: number,
): BudgetedRulePushResult {
    if (remainingBudget <= 0 || additions.length === 0 || groupSize <= 0) {
        return {
            addedRules: [],
            remainingBudget,
        };
    }

    const allowedCount = Math.floor(Math.min(additions.length, remainingBudget) / groupSize) * groupSize;
    const allowedRules = additions.slice(0, allowedCount);
    target.push(...allowedRules);
    return {
        addedRules: allowedRules,
        remainingBudget: remainingBudget - allowedRules.length,
    };
}

function addRuleMetadata(
    metadata: Map<number, RuleMatchInfo>,
    rules: chrome.declarativeNetRequest.Rule[],
    toMatchInfo: (rule: chrome.declarativeNetRequest.Rule) => RuleMatchInfo,
): void {
    for (const rule of rules) {
        metadata.set(rule.id, toMatchInfo(rule));
    }
}

export type ApplyRulesResult = {
    dynamicRuleCount: number;
    staticCoreEnabled: boolean;
    youtubeRulesEnabled: boolean;
};

export async function applyRules(): Promise<ApplyRulesResult> {
    const existingDynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    const settings = await getSync<RuleSettingsSnapshot>([
        "isHeuristicEngineEnabled",
        "heuristicKeywords",
        "heuristicAllowlist",
        "networkBlocklist",
        "defaultBlocklist",
        "disabledSites",
        "isUrlCleanerEnabled",
        "isMalwareProtectionEnabled",
        "isolationModeSites",
        "isYouTubeAdBlockingEnabled",
        "isProtectionEnabled",
    ]);
    const { sessionAllowlist } = await getSession<{ sessionAllowlist?: string[] }>("sessionAllowlist");
    const { protectionPausedUntil } = await getLocal<{ protectionPausedUntil?: number }>("protectionPausedUntil");
    const isProtectionPaused = Boolean(protectionPausedUntil && protectionPausedUntil > Date.now());
    const protectionEnabled = settings.isProtectionEnabled !== false && !isProtectionPaused;
    const youtubeEnabled = protectionEnabled && settings.isYouTubeAdBlockingEnabled !== false;

    await syncCoreRulesetState(protectionEnabled, settings.defaultBlocklist);
    await syncYoutubeRulesetState(youtubeEnabled);

    if (!protectionEnabled) {
        if (existingDynamicRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingDynamicRules.map((rule) => rule.id),
                addRules: [],
            });
        }
        clearDynamicRuleMetadata();
        console.info(
            isProtectionPaused
                ? "ZenithGuard: Protection paused. All dynamic rules disabled."
                : "ZenithGuard: Protection globally disabled. All dynamic rules disabled.",
        );
        return {
            dynamicRuleCount: 0,
            staticCoreEnabled: false,
            youtubeRulesEnabled: false,
        };
    }

    const dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
    const dynamicMetadata = new Map<number, RuleMatchInfo>();
    const disabledSites = normalizeDisabledSites(settings.disabledSites);
    const allowlistedSites = normalizeAllowlistedSites([...(sessionAllowlist || []), ...disabledSites]);
    const maxDynamicRules = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 5_000;
    let remainingBudget = maxDynamicRules;

    const userAllowlistRules = buildUserAllowlistRules(allowlistedSites);
    const userAllowlistPush = pushRuleGroupsWithinBudget(
        dynamicRules,
        userAllowlistRules,
        remainingBudget,
        USER_ALLOWLIST_RULES_PER_SITE,
    );
    remainingBudget = userAllowlistPush.remainingBudget;
    if (userAllowlistPush.addedRules.length < userAllowlistRules.length) {
        console.warn(
            `ZenithGuard: Dynamic rule budget reached while adding user allowlist rules. Applied ${userAllowlistPush.addedRules.length} of ${userAllowlistRules.length}.`,
        );
        remainingBudget = 0;
    }
    addRuleMetadata(dynamicMetadata, userAllowlistPush.addedRules, (rule) => {
        const site = rule.condition.requestDomains?.[0] || rule.condition.initiatorDomains?.[0] || "site";
        return createMatchInfo("User Allowlist", "User", `Protection was paused for ${site}.`, site);
    });

    const isolationRules = buildIsolationModeRules(settings.isolationModeSites);

    const heuristicChunks = chunkHeuristicKeywords(settings.heuristicKeywords);
    const heuristicRules = settings.isHeuristicEngineEnabled !== false
        ? buildHeuristicRules(settings.heuristicKeywords, settings.heuristicAllowlist, allowlistedSites)
        : [];

    const youtubeOverridePayload = youtubeEnabled ? await getDynamicYoutubeRuleOverrides() : null;
    const youtubeRules = buildYoutubeDynamicRules(youtubeOverridePayload);

    const networkBlockRules = buildNetworkBlocklistRules(settings.networkBlocklist);

    const focusModeRules = await createFocusModeRules();

    const budgetedRuleSets: Array<{
        name: string;
        rules: chrome.declarativeNetRequest.Rule[];
        toMatchInfo: (rule: chrome.declarativeNetRequest.Rule) => RuleMatchInfo;
    }> = [
        {
            name: "Focus Mode",
            rules: focusModeRules,
            toMatchInfo: (rule) => {
                const matchedValue = rule.condition.urlFilter?.replace(/^\|\|/, "") || rule.condition.requestDomains?.[0] || "";
                return createMatchInfo("Focus Mode", "Productivity", `Redirected focus-mode navigation for ${matchedValue}.`, matchedValue);
            },
        },
        {
            name: "Isolation Mode",
            rules: isolationRules,
            toMatchInfo: (rule) => {
                const site = rule.condition.initiatorDomains?.[0] || "site";
                return createMatchInfo("Isolation Mode", "Privacy", `Blocked third-party resources while isolating ${site}.`, site);
            },
        },
        {
            name: "Heuristic Engine",
            rules: heuristicRules,
            toMatchInfo: (rule) => {
                const chunkIndex = rule.id - HEURISTIC_RULE_START_ID;
                const chunk = heuristicChunks[chunkIndex];
                const matched = chunk ? chunk.keywords.join(", ") : "heuristic";
                return createMatchInfo("Heuristic Engine", "Heuristic", `Matched heuristic keywords: ${matched}`, matched);
            },
        },
        {
            name: "YouTube Ads",
            rules: youtubeRules,
            toMatchInfo: (rule) => {
                const matchedValue = rule.condition.regexFilter ? `/${rule.condition.regexFilter}/` : rule.condition.urlFilter || "YouTube filter";
                return createMatchInfo("YouTube Ads", "Media", `Matched dynamic YouTube override: ${matchedValue}`, matchedValue);
            },
        },
        {
            name: "Network Blocklist",
            rules: networkBlockRules,
            toMatchInfo: (rule) => {
                const matchedValue = rule.condition.urlFilter?.replace(/^\|\|/, "").replace(/\^$/, "") || "";
                return createMatchInfo("Network Blocklist", "User", `Matched user block rule: ${matchedValue}`, matchedValue);
            },
        },
    ];

    for (const ruleSet of budgetedRuleSets) {
        const rulePush = pushRulesWithinBudget(dynamicRules, ruleSet.rules, remainingBudget);
        remainingBudget = rulePush.remainingBudget;
        if (rulePush.addedRules.length < ruleSet.rules.length) {
            console.warn(
                `ZenithGuard: Dynamic rule budget reached while adding ${ruleSet.name} rules. Applied ${rulePush.addedRules.length} of ${ruleSet.rules.length}.`,
            );
        }
        addRuleMetadata(dynamicMetadata, rulePush.addedRules, ruleSet.toMatchInfo);
    }

    if (settings.isMalwareProtectionEnabled !== false && remainingBudget > 0) {
        const malwareRules = buildMalwareRules(await getMergedMalwareDomains(), allowlistedSites, remainingBudget);
        addRuleMetadata(dynamicMetadata, malwareRules, (rule) => {
            const domainCount = rule.condition.requestDomains?.length || 0;
            return createMatchInfo(
                "Malware Protection",
                "Security",
                domainCount > 0
                    ? `Matched a malware-domain ruleset chunk (${domainCount} domains).`
                    : "Known malware or hostile-domain redirect protection.",
            );
        });
        dynamicRules.push(...malwareRules);
    }

    const dedupedDynamicRules = Array.from(new Map(dynamicRules.map((rule) => [rule.id, rule])).values());
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingDynamicRules.map((rule) => rule.id),
        addRules: dedupedDynamicRules,
    });

    setDynamicRuleMetadata(dynamicMetadata);
    console.info(`ZenithGuard: Applying ${dedupedDynamicRules.length} dynamic rules.`);

    return {
        dynamicRuleCount: dedupedDynamicRules.length,
        staticCoreEnabled: true,
        youtubeRulesEnabled: youtubeEnabled,
    };
}
