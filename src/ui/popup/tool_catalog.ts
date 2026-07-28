import type { PageToolActionType, PopupToolDefinition } from "./types";

export const PAGE_ACTION_TOOLS: PopupToolDefinition[] = [
    {
        actionType: "START_INSPECTOR_MODE",
        label: "Inspector",
        description: "Primary manual cleanup tool. Best option for paywalls, overlays, and stubborn elements.",
        icon: "inspect",
    },
    {
        actionType: "START_ZAPPER_MODE",
        label: "Zapper",
        description: "Hide one obvious element quickly.",
        icon: "zap",
    },
    {
        actionType: "FIX_COOKIES",
        label: "Fix Cookies",
        description: "Try to dismiss or accept the clearest cookie consent action on the page.",
        icon: "cookie",
    },
    {
        actionType: "DEFEAT_WALL",
        label: "Experimental Wall Assist",
        description: "AI guess for article blockers and paywall nags. Unreliable. Use Inspector if you need a real fix.",
        icon: "wall",
    },
];

export const SITE_ACTION_TOOL_LABELS = {
    isolationMode: {
        on: "Isolation On",
        off: "Toggle Isolation",
        description: "Strengthen site privacy by blocking third-party frames and scripts.",
    },
    forgetfulBrowsing: {
        on: "Forgetful On",
        off: "Toggle Forgetful",
        description: "Clear cookies and local site data automatically after closing this site.",
    },
    sitePause: {
        on: "Pause Site",
        off: "Resume Site",
        description: "Temporarily stand down or restore protection for this domain.",
    },
    logger: {
        label: "Open Logger",
        description: "Inspect live request decisions and exact matched rules.",
    },
} as const;

export function isBusyToolAction(actionType: PageToolActionType): boolean {
    return actionType === "FIX_COOKIES" || actionType === "DEFEAT_WALL";
}
