import type {
    TemporaryWallFix,
    ToolActivityAction,
    ToolActivityEntry,
    ToolStatusCard,
    WallFixDetailItem,
} from "./types";

export function formatToolTimestamp(timestamp: number): string {
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

export function getToolActivityFollowUp(entry: ToolActivityEntry): ToolActivityAction | null {
    if (
        (entry.tool === "Defeat Wall (Beta)" || entry.tool === "Experimental Wall Assist")
        && (
            entry.title === "Partial Wall Fix Applied"
            || entry.title === "No Useful Wall Fix Found"
            || entry.title === "AI Timed Out"
            || entry.title === "Defeat Wall Failed"
        )
    ) {
        return { label: "Open Inspector", action: "open-inspector-wall" };
    }

    if (entry.tool === "Fix Cookies") {
        if (entry.title === "No Clear Cookie Action") {
            return { label: "Open Inspector", action: "open-inspector" };
        }
        if (entry.title === "Gemini Key Required") {
            return { label: "Open Settings", action: "open-settings" };
        }
    }

    if (entry.tool === "Site Report" && entry.title === "Site Report Copied") {
        return { label: "Open Logger Review", action: "open-logger-review" };
    }

    return null;
}

export function mapAiToolError(error: string, toolLabel: string): ToolStatusCard {
    if (error === "QUOTA_EXCEEDED") {
        return {
            title: "AI Quota Reached",
            message: "Gemini hit the usage limit for this key. Wait for quota to reset or switch to another key in Settings.",
            tone: "error",
        };
    }

    if (error === "AI_TIMEOUT") {
        return {
            title: "AI Timed Out",
            message: `${toolLabel} took too long on this page. Use Inspector if you need a reliable manual cleanup instead of waiting on another AI guess.`,
            tone: "error",
            actionLabel: toolLabel === "Defeat Wall" ? "Open Inspector" : undefined,
            action: toolLabel === "Defeat Wall" ? "open-inspector-wall" : undefined,
        };
    }

    if (error === "TAB_CLOSED") {
        return {
            title: "Tab Not Available",
            message: "The active tab changed or closed before the AI tool could finish.",
            tone: "error",
        };
    }

    if (error.includes("Gemini API key is not set")) {
        return {
            title: "Gemini Key Required",
            message: "Add your Gemini API key in Settings before using this AI tool.",
            tone: "error",
            actionLabel: "Open Settings",
            action: "open-settings",
        };
    }

    return {
        title: `${toolLabel} Failed`,
        message: error,
        tone: "error",
        actionLabel: toolLabel === "Defeat Wall" ? "Open Inspector" : undefined,
        action: toolLabel === "Defeat Wall" ? "open-inspector-wall" : undefined,
    };
}

export function mapToolLaunchError(error: string, toolLabel: string): ToolStatusCard {
    if (error.includes("Could not establish connection") || error.includes("Receiving end does not exist")) {
        return {
            title: `${toolLabel} Not Available`,
            message: "ZenithGuard could not reach its page tools on this tab. Reload the page and try again, or use a normal website tab instead of a protected browser page.",
            tone: "error",
        };
    }

    if (error.includes("No tab with id")) {
        return {
            title: "Tab Not Available",
            message: `The tab changed or closed before ${toolLabel} could start.`,
            tone: "error",
        };
    }

    return {
        title: `${toolLabel} Failed to Launch`,
        message: error,
        tone: "error",
    };
}

export function describeWallFixDetails(wallFix: TemporaryWallFix | null): WallFixDetailItem[] {
    if (!wallFix) {
        return [];
    }

    return [
        { label: "Overlay", value: wallFix.overlaySelector || "None returned" },
        { label: "Scroll unlock", value: wallFix.scrollSelector || "body, html" },
        { label: "Content unlock", value: wallFix.contentUnlockSelector || "None returned" },
        { label: "AI reasoning", value: wallFix.reasoning || "No reasoning returned" },
    ];
}

export function getWallFixStatusCard(wallFix: TemporaryWallFix | null, hasSavedWallFix: boolean): ToolStatusCard | null {
    if (!wallFix && !hasSavedWallFix) {
        return null;
    }

    if (wallFix) {
        const partial = !(wallFix.contentUnlockSelector || "").trim();
        return partial
            ? {
                title: "Wall Fix Status: partial",
                message: "The temporary wall fix hid something, but it did not find a strong content unlock target. Review it before saving.",
                tone: "info",
                actionLabel: "Open Inspector",
                action: "open-inspector-wall",
            }
            : {
                title: "Wall Fix Status: promising",
                message: "A temporary wall fix is active. Save it only if the page now looks correct.",
                tone: "success",
            };
    }

    return {
        title: "Wall Fix Status: saved",
        message: "A saved wall fix already exists for this site.",
        tone: "info",
    };
}
