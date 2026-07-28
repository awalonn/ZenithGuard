export type ContentMessage =
    | { type: "START_INSPECTOR_MODE"; mode: "default" | "wall-recovery" }
    | { type: "START_ZAPPER_MODE" }
    | { type: "QUICK_HIDE_ELEMENT" }
    | { type: "START_AI_HIDING_TARGETED" }
    | { type: "REAPPLY_HIDING_RULES" }
    | { type: "EXECUTE_ADBLOCK_WALL_FIX"; selectors: { overlaySelector: string; scrollSelector?: string; contentUnlockSelector?: string } }
    | { type: "EXECUTE_COOKIE_CONSENT_ACTION"; selector: string }
    | { type: "SHOW_PROCESSING_TOAST"; message: string }
    | { type: "CLEAR_PROCESSING_TOAST" }
    | { type: "SHOW_ERROR_TOAST"; message: string }
    | { type: "SHOW_BREACH_WARNING"; domain: string };

export type ContentMessageValidationResult =
    | { ok: true; message: ContentMessage }
    | { ok: false; error: string };

export const SIMPLE_CONTENT_MESSAGE_TYPES = [
    "START_ZAPPER_MODE",
    "QUICK_HIDE_ELEMENT",
    "START_AI_HIDING_TARGETED",
    "REAPPLY_HIDING_RULES",
    "CLEAR_PROCESSING_TOAST",
] as const;

type SimpleContentMessageType = typeof SIMPLE_CONTENT_MESSAGE_TYPES[number];
type SimpleContentMessage = Extract<ContentMessage, { type: SimpleContentMessageType }>;

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function success(message: ContentMessage): ContentMessageValidationResult {
    return { ok: true, message };
}

function failure(error: string): ContentMessageValidationResult {
    return { ok: false, error };
}

function isSimpleContentMessageType(type: string): type is SimpleContentMessageType {
    return SIMPLE_CONTENT_MESSAGE_TYPES.includes(type as SimpleContentMessageType);
}

function validateSimpleContentMessage(type: SimpleContentMessageType): ContentMessageValidationResult {
    return success({ type } as SimpleContentMessage);
}

export function validateContentMessage(rawMessage: unknown): ContentMessageValidationResult {
    if (!isObjectLike(rawMessage) || typeof rawMessage.type !== "string") {
        return failure("Invalid content message: expected object payload with type.");
    }

    switch (rawMessage.type) {
        case "START_INSPECTOR_MODE":
            return success({
                type: rawMessage.type,
                mode: rawMessage.mode === "wall-recovery" ? "wall-recovery" : "default",
            });
        case "EXECUTE_ADBLOCK_WALL_FIX": {
            const selectors = rawMessage.selectors;
            if (!isObjectLike(selectors) || !isNonEmptyString(selectors.overlaySelector)) {
                return failure("EXECUTE_ADBLOCK_WALL_FIX requires selectors.overlaySelector:string.");
            }

            return success({
                type: rawMessage.type,
                selectors: {
                    overlaySelector: selectors.overlaySelector,
                    scrollSelector: isNonEmptyString(selectors.scrollSelector) ? selectors.scrollSelector : undefined,
                    contentUnlockSelector: isNonEmptyString(selectors.contentUnlockSelector) ? selectors.contentUnlockSelector : undefined,
                },
            });
        }
        case "EXECUTE_COOKIE_CONSENT_ACTION":
            return isNonEmptyString(rawMessage.selector)
                ? success({ type: rawMessage.type, selector: rawMessage.selector })
                : failure("EXECUTE_COOKIE_CONSENT_ACTION requires selector:string.");
        case "SHOW_PROCESSING_TOAST":
        case "SHOW_ERROR_TOAST":
            return isNonEmptyString(rawMessage.message)
                ? success({ type: rawMessage.type, message: rawMessage.message })
                : failure(`${rawMessage.type} requires message:string.`);
        case "SHOW_BREACH_WARNING":
            return isNonEmptyString(rawMessage.domain)
                ? success({ type: rawMessage.type, domain: rawMessage.domain })
                : failure("SHOW_BREACH_WARNING requires domain:string.");
        default:
            return isSimpleContentMessageType(rawMessage.type)
                ? validateSimpleContentMessage(rawMessage.type)
                : failure("Invalid content message: unsupported type.");
    }
}
