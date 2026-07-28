export type SettingsSectionId = "dashboard" | "general-settings" | "my-rules" | "about";

export type ToggleableRule = {
    value: string;
    enabled: boolean;
};

export type HidingRule = ToggleableRule & {
    lastHealed?: number;
    lastHealAttempt?: number;
};

export type CustomHidingRules = Record<string, HidingRule[]>;

export type PersistentWallFixMap = Record<string, { enabled?: boolean; [key: string]: unknown }>;

export type NetworkBlocklistMeta = Record<string, {
    source?: string;
    addedAt?: number;
}>;

export type NetworkRuleOriginFilter =
    | "all"
    | "logger"
    | "analyzer"
    | "settings"
    | "inspector"
    | "local-ai"
    | "custom";

export type SettingsRuleSnapshot = {
    defaultBlocklist: ToggleableRule[];
    networkBlocklist: ToggleableRule[];
    networkBlocklistMeta: NetworkBlocklistMeta;
    isolationModeSites: ToggleableRule[];
    forgetfulSites: ToggleableRule[];
    focusBlocklist: string[];
    heuristicKeywords: ToggleableRule[];
    customHidingRules: CustomHidingRules;
    persistentWallFixes: PersistentWallFixMap;
    disabledSites: string[];
};

export type CoreSettingId =
    | "isProtectionEnabled"
    | "isNextGenAIEradicatorEnabled"
    | "isYouTubeAdBlockingEnabled"
    | "isHeuristicEngineEnabled"
    | "isMalwareProtectionEnabled"
    | "isUrlCleanerEnabled"
    | "isCookieBannerHidingEnabled"
    | "isBreachWarningEnabled"
    | "isSandboxedIframeEnabled"
    | "isPerformanceModeEnabled"
    | "isSelfHealingEnabled";

export type SettingsSnapshot = Record<CoreSettingId, boolean> & {
    theme: "dark" | "light";
};

export type CoreSettingDefinition = {
    id: CoreSettingId;
    name: string;
    desc: string;
};

export type NavigationItem = {
    id: SettingsSectionId;
    label: string;
    path: string;
};

export type MalwareFeedStatus = {
    remoteSourceLabel: string;
    bundledSeedPath: string;
    cachedDomains: number;
    lastUpdated: number | null;
};

export type SettingsDashboardSnapshot = {
    toolActivityToday: number;
    customNetworkRules: number;
    enabledCoreRules: number;
};

export type ExtensionHealthSnapshot = {
    status: "ready" | "attention";
    statusLabel: string;
    issues: string[];
    extensionId: string;
    manifestVersion: string;
    enabledRulesets: string[];
    dynamicRuleCount: number;
    staticCoreEnabled: boolean;
    youtubeRulesEnabled: boolean;
    youtubeRulesExpected: boolean;
    settingsInitialized: boolean;
    protectionEnabled: boolean;
    defaultOverrideCount: number;
    pausedUntil: number | null;
    sessionAllowlistCount: number;
    disabledSiteCount: number;
};

export type ActiveTabDiagnosticsContext = {
    source: "recent-web-tab" | "unavailable";
    tabId: number | null;
    windowId: number | null;
    origin: string;
    hostname: string;
    domain: string;
    protocol: "http:" | "https:" | "";
    redactedUrl: string;
    hasPath: boolean;
    hasQuery: boolean;
    hasHash: boolean;
    unavailableReason?: "no-web-tab" | "tabs-query-failed";
};

export type DiagnosticsPreviewItem = {
    label: string;
    value: string;
    detail?: string;
};

export type DiagnosticsNetworkSummary = {
    source: "tab-log" | "unavailable";
    totalEntries: number;
    blockedEntries: number;
    allowedEntries: number;
    modifiedEntries: number;
    sessionStartedAt: number | null;
    lastUpdatedAt: number | null;
    unavailableReason?: "no-web-tab" | "network-log-unavailable";
};

export type GeminiModelPreset = {
    value: string;
    label: string;
};

export type LocalAiClassificationResult =
    | { error: string }
    | { isAdRelated: boolean; confidence?: number; score?: number };

export type LocalAiBlockActionState = {
    candidateDomain: string | null;
    isEligible: boolean;
    isLoading: boolean;
    isAdded: boolean;
    message: string;
};

export type RuleActivityEntry = {
    category: "network" | "hiding";
    label: string;
    detail: string;
    timestamp: number;
};

export type RulesSummaryChip = {
    label: string;
    value: string | number;
    detail?: string;
};

export type IndexedToggleableRuleEntry = {
    index: number;
    rule: ToggleableRule;
};
