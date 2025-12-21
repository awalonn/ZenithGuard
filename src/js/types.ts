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
    defaultBlocklist: any[]; // Was string[], now supports { value, enabled }
    networkBlocklist: any[]; // Was string[], now supports { value, enabled }
    heuristicKeywords: string[];
    heuristicAllowlist?: { value: string; enabled: boolean }[];
    enabledStaticRulesets: string[];

    // Meta
    geminiApiKey?: string;
    installDate?: number;
    youtubeRulesUrl?: string; // Advanced: Custom URL for YT rules

    trackerListUrl?: string; // Advanced: Custom URL for tracker list

    // Focus Mode
    isFocusModeEnabled?: boolean;
    focusModeUntil?: number;
    focusBlocklist?: string[];

    // Wall Fixes
    persistentWallFixes?: Record<string, { overlaySelector: string; scrollSelector?: string; enabled: boolean }>;
}

// Broad type for Chrome's storage object if partial
export type PartialSettings = Partial<AppSettings>;

// --- Privacy Insights ---
export type PrivacyGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TrackerDefinition {
    id: string;
    name: string;
    category: 'Advertising' | 'Analytics' | 'Fingerprinting' | 'Social' | 'Cryptomining' | 'Unknown';
    owner?: string;
}

export interface PrivacyStats {
    grade: PrivacyGrade;
    score: number; // 0-100
    trackersBlocked: number;
    trackersFound: TrackerDefinition[]; // What we found on the page
}
