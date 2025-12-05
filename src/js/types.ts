export interface HidingRule {
    value: string; // The CSS selector
    enabled: boolean;
    lastHealed?: number;
    lastHealAttempt?: number;
}

export interface FilterList {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    lastUpdated?: number;

    ruleCount?: number;
    status?: string;
}

export interface AppSettings {
    // Toggles
    isProtectionEnabled: boolean;
    isHeuristicEngineEnabled: boolean;
    isUrlCleanerEnabled: boolean;
    isMalwareProtectionEnabled: boolean;
    isYouTubeAdBlockingEnabled: boolean;
    isCookieBannerHidingEnabled: boolean;
    isSelfHealingEnabled: boolean;
    isPerformanceModeEnabled: boolean;
    isSandboxedIframeEnabled: boolean;

    // Data
    customHidingRules: Record<string, HidingRule[]>;
    disabledSites: string[];
    isolationModeSites: string[];
    forgetfulSites: string[];

    // Lists
    filterLists: FilterList[];
    defaultBlocklist: string[]; // URLs or patterns
    networkBlocklist: string[];
    heuristicKeywords: string[];
    heuristicAllowlist?: { value: string; enabled: boolean }[];
    enabledStaticRulesets: string[];

    // Meta
    geminiApiKey?: string;
    installDate?: number;
    youtubeRulesUrl?: string; // Advanced: Custom URL for YT rules
    trackerListUrl?: string; // Advanced: Custom URL for tracker list
}

// Broad type for Chrome's storage object if partial
export type PartialSettings = Partial<AppSettings>;
