import {
    getToolActivityFollowUp,
    getWallFixStatusCard,
    mapAiToolError,
} from "../../src/ui/popup/tool_activity";
import type { ToolActivityEntry } from "../../src/ui/popup/types";

describe("popup tool activity mapping", () => {
    it("routes partial wall-fix outcomes to wall-recovery inspector mode", () => {
        const entry: ToolActivityEntry = {
            tool: "Experimental Wall Assist",
            title: "Partial Wall Fix Applied",
            message: "Partial result",
            tone: "info",
            timestamp: Date.now(),
        };

        expect(getToolActivityFollowUp(entry)).toEqual({
            label: "Open Inspector",
            action: "open-inspector-wall",
        });
    });

    it("routes missing cookie actions to normal inspector mode", () => {
        const entry: ToolActivityEntry = {
            tool: "Fix Cookies",
            title: "No Clear Cookie Action",
            message: "No clear button",
            tone: "info",
            timestamp: Date.now(),
        };

        expect(getToolActivityFollowUp(entry)).toEqual({
            label: "Open Inspector",
            action: "open-inspector",
        });
    });

    it("routes copied site reports to Logger review", () => {
        const entry: ToolActivityEntry = {
            tool: "Site Report",
            title: "Site Report Copied",
            message: "Copied the current site report.",
            tone: "success",
            timestamp: Date.now(),
        };

        expect(getToolActivityFollowUp(entry)).toEqual({
            label: "Open Logger Review",
            action: "open-logger-review",
        });
    });

    it("maps missing Gemini key errors to an actionable settings card", () => {
        expect(mapAiToolError("Gemini API key is not set", "Fix Cookies")).toMatchObject({
            title: "Gemini Key Required",
            tone: "error",
            actionLabel: "Open Settings",
            action: "open-settings",
        });
    });

    it("maps wall-assist timeouts to Inspector follow-up", () => {
        expect(mapAiToolError("AI_TIMEOUT", "Defeat Wall")).toMatchObject({
            title: "AI Timed Out",
            tone: "error",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        });
    });

    it("marks partial temporary wall fixes as inspector follow-ups", () => {
        expect(
            getWallFixStatusCard(
                {
                    overlaySelector: ".paywall-overlay",
                    scrollSelector: "body",
                    contentUnlockSelector: "",
                },
                false,
            ),
        ).toMatchObject({
            title: "Wall Fix Status: partial",
            tone: "info",
            actionLabel: "Open Inspector",
            action: "open-inspector-wall",
        });
    });
});
