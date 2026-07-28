import type {
    CoreSettingDefinition,
    GeminiModelPreset,
    NavigationItem,
    SettingsSnapshot,
} from "./types";

export const SETTINGS_NAV_ITEMS: NavigationItem[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        path: "M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z",
    },
    {
        id: "general-settings",
        label: "General Settings",
        path: "M12,8A4,4 0 1,0 16,12A4,4 0 0,0 12,8M12,2A1,1 0 0,1 13,3V5.08A7.38,7.38 0 0,1 15,5.93L16.41,4.52A1,1 0 0,1 17.83,4.52L19.24,5.93A1,1 0 0,1 19.24,7.35L17.83,8.76A7.38,7.38 0 0,1 18.68,10.76H20.76A1,1 0 0,1 21.76,11.76V13.76A1,1 0 0,1 20.76,14.76H18.68A7.38,7.38 0 0,1 17.83,16.76L19.24,18.17A1,1 0 0,1 19.24,19.59L17.83,21A1,1 0 0,1 16.41,21L15,19.59A7.38,7.38 0 0,1 13,20.44V22.52A1,1 0 0,1 12,23.52H10A1,1 0 0,1 9,22.52V20.44A7.38,7.38 0 0,1 7,19.59L5.59,21A1,1 0 0,1 4.17,21L2.76,19.59A1,1 0 0,1 2.76,18.17L4.17,16.76A7.38,7.38 0 0,1 3.32,14.76H1.24A1,1 0 0,1 0.24,13.76V11.76A1,1 0 0,1 1.24,10.76H3.32A7.38,7.38 0 0,1 4.17,8.76L2.76,7.35A1,1 0 0,1 2.76,5.93L4.17,4.52A1,1 0 0,1 5.59,4.52L7,5.93A7.38,7.38 0 0,1 9,5.08V3A1,1 0 0,1 10,2H12Z",
    },
    {
        id: "my-rules",
        label: "My Rules",
        path: "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z",
    },
    {
        id: "about",
        label: "About",
        path: "M11,9H13V7H11M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M11,17H13V11H11V17Z",
    },
];

export const DEFAULT_SETTINGS: SettingsSnapshot = {
    isProtectionEnabled: true,
    isNextGenAIEradicatorEnabled: true,
    isYouTubeAdBlockingEnabled: true,
    isHeuristicEngineEnabled: true,
    isMalwareProtectionEnabled: true,
    isUrlCleanerEnabled: true,
    isCookieBannerHidingEnabled: false,
    isBreachWarningEnabled: true,
    isSandboxedIframeEnabled: true,
    isPerformanceModeEnabled: false,
    isSelfHealingEnabled: false,
    theme: "dark",
};

export const CORE_PROTECTION_SETTINGS: CoreSettingDefinition[] = [
    {
        id: "isNextGenAIEradicatorEnabled",
        name: "Next-Gen AI Eradicator",
        desc: "Sinks structural ads and uses Local AI to verify semantic trackers.",
    },
    {
        id: "isYouTubeAdBlockingEnabled",
        name: "Dedicated YouTube Ad Blocking",
        desc: "Blocks pre-roll and mid-roll ads on YouTube.",
    },
    {
        id: "isHeuristicEngineEnabled",
        name: "Heuristic Engine",
        desc: "Proactively blocks new trackers.",
    },
    {
        id: "isMalwareProtectionEnabled",
        name: "Malware and Phishing Protection",
        desc: "Blocks access to known threats using a bundled seed plus a refreshed remote security feed.",
    },
    {
        id: "isUrlCleanerEnabled",
        name: "Clean URLs",
        desc: "Strips tracking parameters like ?utm_.",
    },
    {
        id: "isCookieBannerHidingEnabled",
        name: "AI-Powered Cookie Consent",
        desc: "Uses AI to auto-reject cookies.",
    },
    {
        id: "isBreachWarningEnabled",
        name: "Data Breach Warnings",
        desc: "Shows a site banner and password-field reminder on domains with known breach history.",
    },
    {
        id: "isSandboxedIframeEnabled",
        name: "Sandboxed iFrame Protection",
        desc: "Restricts third-party iFrames.",
    },
];

export const GEMINI_MODEL_PRESETS: GeminiModelPreset[] = [
    { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { value: "gemini-2.5-flash-lite-preview-09-2025", label: "gemini-2.5-flash-lite-preview-09-2025" },
    { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
];
