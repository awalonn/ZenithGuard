import { validateRuntimeMessage } from "../../src/js/background/modules/message_contracts/validator";
import { combineActionRegistries, type BackgroundActionMap } from "../../src/js/background/modules/message_registry";
import { BACKGROUND_ACTION_MESSAGE_TYPES, SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES } from "../../src/js/shared/runtime_messages";
import { validateContentMessage } from "../../src/js/shared/content_messages";

describe("validateRuntimeMessage", () => {
    it("accepts HANDLE_COOKIE_CONSENT with explicit tabId", () => {
        const result = validateRuntimeMessage({
            type: "HANDLE_COOKIE_CONSENT",
            data: { tabId: 42 },
        });

        expect(result).toEqual({
            ok: true,
            message: {
                type: "HANDLE_COOKIE_CONSENT",
                data: { tabId: 42 },
            },
        });
    });

    it("preserves ADD_TO_NETWORK_BLOCKLIST source metadata", () => {
        const result = validateRuntimeMessage({
            type: "ADD_TO_NETWORK_BLOCKLIST",
            domain: "example.com",
            source: "logger",
        });

        expect(result).toEqual({
            ok: true,
            message: {
                type: "ADD_TO_NETWORK_BLOCKLIST",
                domain: "example.com",
                source: "logger",
            },
        });
    });

    it("accepts Inspector as ADD_TO_NETWORK_BLOCKLIST source metadata", () => {
        const result = validateRuntimeMessage({
            type: "ADD_TO_NETWORK_BLOCKLIST",
            domain: "ads.example.com",
            source: "inspector",
        });

        expect(result).toEqual({
            ok: true,
            message: {
                type: "ADD_TO_NETWORK_BLOCKLIST",
                domain: "ads.example.com",
                source: "inspector",
            },
        });
    });

    it("rejects unsupported ADD_TO_NETWORK_BLOCKLIST sources", () => {
        const result = validateRuntimeMessage({
            type: "ADD_TO_NETWORK_BLOCKLIST",
            domain: "example.com",
            source: "popup",
        });

        expect(result).toMatchObject({
            ok: false,
            error: expect.stringContaining("ADD_TO_NETWORK_BLOCKLIST source"),
        });
    });

    it("accepts every shared simple background action type without payload", () => {
        for (const type of SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES) {
            expect(validateRuntimeMessage({ type })).toEqual({
                ok: true,
                message: { type },
            });
        }
    });
});

describe("validateContentMessage", () => {
    it("normalizes inspector mode and accepts current page-tool commands", () => {
        expect(validateContentMessage({
            type: "START_INSPECTOR_MODE",
            mode: "wall-recovery",
        })).toEqual({
            ok: true,
            message: {
                type: "START_INSPECTOR_MODE",
                mode: "wall-recovery",
            },
        });

        expect(validateContentMessage({
            type: "START_INSPECTOR_MODE",
            mode: "unexpected",
        })).toEqual({
            ok: true,
            message: {
                type: "START_INSPECTOR_MODE",
                mode: "default",
            },
        });

        expect(validateContentMessage({ type: "START_ZAPPER_MODE" })).toEqual({
            ok: true,
            message: { type: "START_ZAPPER_MODE" },
        });
    });

    it("accepts typed wall-fix and toast commands", () => {
        expect(validateContentMessage({
            type: "EXECUTE_ADBLOCK_WALL_FIX",
            selectors: {
                overlaySelector: ".paywall",
                scrollSelector: "body",
                contentUnlockSelector: ".article",
            },
        })).toEqual({
            ok: true,
            message: {
                type: "EXECUTE_ADBLOCK_WALL_FIX",
                selectors: {
                    overlaySelector: ".paywall",
                    scrollSelector: "body",
                    contentUnlockSelector: ".article",
                },
            },
        });

        expect(validateContentMessage({
            type: "SHOW_ERROR_TOAST",
            message: "Could not apply fix.",
        })).toEqual({
            ok: true,
            message: {
                type: "SHOW_ERROR_TOAST",
                message: "Could not apply fix.",
            },
        });
    });

    it("rejects stale preview commands and malformed tool payloads", () => {
        expect(validateContentMessage({
            type: "PREVIEW_ELEMENT",
            selector: ".ad",
        })).toMatchObject({
            ok: false,
            error: expect.stringContaining("unsupported type"),
        });

        expect(validateContentMessage({ type: "CLEAR_PREVIEW" })).toMatchObject({
            ok: false,
            error: expect.stringContaining("unsupported type"),
        });

        expect(validateContentMessage({
            type: "PREVIEW_MANUAL_RULE",
            selector: ".ad",
        })).toMatchObject({
            ok: false,
            error: expect.stringContaining("unsupported type"),
        });

        expect(validateContentMessage({
            type: "EXECUTE_ADBLOCK_WALL_FIX",
            selectors: {},
        })).toMatchObject({
            ok: false,
            error: expect.stringContaining("overlaySelector"),
        });
    });
});

describe("message action registry", () => {
    it("accepts handlers for every shared background action type", () => {
        const registry = Object.fromEntries(
            BACKGROUND_ACTION_MESSAGE_TYPES.map((type) => [type, async () => undefined]),
        ) as BackgroundActionMap;

        expect(combineActionRegistries(registry)).toEqual(registry);
    });

    it("reports missing handlers using the shared background action list", () => {
        const registry = Object.fromEntries(
            BACKGROUND_ACTION_MESSAGE_TYPES
                .filter((type) => type !== "CLASSIFY_TEXT_LOCALLY")
                .map((type) => [type, async () => undefined]),
        ) as BackgroundActionMap;

        expect(() => combineActionRegistries(registry)).toThrow("CLASSIFY_TEXT_LOCALLY");
    });
});
