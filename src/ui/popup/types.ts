import type { ContentMessage } from "../../js/shared/content_messages";
import type { WallAssistTrace } from "../../js/shared/wall_assist_trace";

export type PopupTab = "home" | "insights" | "tools";

type PopupContentToolActionType = Extract<ContentMessage, {
    type: "START_ZAPPER_MODE" | "START_INSPECTOR_MODE";
}>["type"];

export type PageToolActionType =
    | PopupContentToolActionType
    | "FIX_COOKIES"
    | "DEFEAT_WALL"
    | "OPEN_LOGGER";

export type ToolTone = "info" | "success" | "error";

export type PopupToolIcon = "zap" | "inspect" | "cookie" | "shield" | "list" | "wall";

export type PopupToolDefinition = {
    actionType: PageToolActionType;
    label: string;
    description: string;
    icon: PopupToolIcon;
};

export type ToolActivityEntry = {
    tool: string;
    title: string;
    message: string;
    tone: ToolTone;
    timestamp: number;
    domain?: string;
};

export type CosmeticCleanupSummary = {
    count: number;
    latestHint?: string;
    updatedAt: number;
    pageUrl?: string;
};

export type ToolActionId =
    | "open-settings"
    | "open-inspector"
    | "open-inspector-wall"
    | "open-logger"
    | "open-logger-review"
    | "review-wall-fix";

export type ToolActivityAction = {
    label: string;
    action: ToolActionId;
};

export type ToolStatusCard = {
    title: string;
    message: string;
    tone: ToolTone;
    actionLabel?: string;
    action?: ToolActionId;
};

export type TemporaryWallFix = {
    overlaySelector: string;
    scrollSelector?: string;
    contentUnlockSelector?: string;
    reasoning?: string;
};

export type WallFixDetailItem = {
    label: string;
    value: string;
};

export type SitePolicyState = {
    hostname: string;
    isExtensionPage: boolean;
    isProtectionEnabled: boolean;
    isSiteProtectionEnabled: boolean;
    isPausedByTimer: boolean;
    isIsolationModeEnabled: boolean;
    isForgetfulBrowsingEnabled: boolean;
    hasCustomHidingRules: boolean;
    hasSavedWallFix: boolean;
    hasTemporaryWallFix: boolean;
    hasPartialTemporaryWallFix: boolean;
    hiddenRuleCount: number;
    activeSiteModes: number;
    focusModeActive: boolean;
    focusModeUntilText: string;
};

export type PopupNetworkLog = {
    id: number;
    url: string;
    status: string;
    type?: string;
    timestamp: number;
    matchedRuleInfo?: {
        source?: string;
        detail?: string;
        matchedValue?: string;
        category?: string;
    };
};

export type PopupReviewCandidateSummary = {
    domain: string;
    type: string;
    reason: string;
};

export type PopupPrivacyStats = {
    trackersDetected?: number;
    trackersBlocked?: number;
    [key: string]: unknown;
};

export type PopupSettingsSnapshot = {
    isProtectionEnabled?: boolean;
    disabledSites?: string[];
    isolationModeSites?: Array<{ value: string; enabled: boolean }>;
    forgetfulSites?: Array<{ value: string; enabled: boolean }>;
    customHidingRules?: Record<string, Array<{ value: string; enabled: boolean }>>;
    persistentWallFixes?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
    isFocusModeEnabled?: boolean;
    focusModeUntil?: number;
    isBreachWarningEnabled?: boolean;
};

export type PopupStorageSnapshot = {
    toolActivityLog: ToolActivityEntry[];
    temporaryWallFixes: Record<string, TemporaryWallFix>;
    cosmeticCleanupSummaryByHostname: Record<string, CosmeticCleanupSummary>;
    wallAssistTraceByHostname?: Record<string, WallAssistTrace>;
    protectionPausedUntil?: number;
};

export type PopupSnapshot = {
    tabId: number | null;
    hostname: string;
    pageUrl: string | null;
    isExtensionPage: boolean;
    settings: Required<PopupSettingsSnapshot>;
    storage: PopupStorageSnapshot;
    privacyStats: PopupPrivacyStats;
    networkLog: PopupNetworkLog[];
    hiddenRules: Array<{ value: string; enabled: boolean }>;
    temporaryWallFix: TemporaryWallFix | null;
    wallAssistTrace: WallAssistTrace | null;
    hasSavedWallFix: boolean;
    hasRecentAiScan: boolean;
};
