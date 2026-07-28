import {
    BACKGROUND_ACTION_MESSAGE_TYPES,
    NETWORK_BLOCKLIST_SOURCES,
    SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES,
    type BackgroundActionMessage,
    type BackgroundActionMessageType,
    type NetworkBlocklistSource,
    type SimpleBackgroundActionMessageType,
} from "../../../shared/runtime_messages";

export type ValidationResult<T> =
    | { ok: true; message: T }
    | { ok: false; error: string };

export type ValidatedMessage = BackgroundActionMessage;

export function toErrorResult(error: string): ValidationResult<never> {
    return { ok: false, error };
}

export function toSuccessResult<T>(message: T): ValidationResult<T> {
    return { ok: true, message };
}

function getValidationError(result: ValidationResult<unknown>, fallback: string): string {
    return "error" in result ? result.error : fallback;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) >= 0;
}

function isSupportedMessageType(value: unknown): value is BackgroundActionMessageType {
    return typeof value === "string" && BACKGROUND_ACTION_MESSAGE_TYPES.includes(value as BackgroundActionMessageType);
}

function isSimpleBackgroundActionMessageType(value: unknown): value is SimpleBackgroundActionMessageType {
    return typeof value === "string" && SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES.includes(value as SimpleBackgroundActionMessageType);
}

function isNetworkBlocklistSource(value: unknown): value is NetworkBlocklistSource {
    return typeof value === "string" && NETWORK_BLOCKLIST_SOURCES.includes(value as NetworkBlocklistSource);
}

function validatePayloadObject(
    value: unknown,
    errorMessage: string,
): ValidationResult<Record<string, unknown>> {
    return isObjectLike(value)
        ? toSuccessResult(value)
        : toErrorResult(errorMessage);
}

function validateBooleanToggleMessage(
    type: "TOGGLE_GLOBAL_PROTECTION",
    payload: unknown,
    key: "isEnabled",
    errorMessage: string,
): ValidationResult<ValidatedMessage> {
    const result = validatePayloadObject(payload, errorMessage);
    if (!result.ok) {
        return toErrorResult(getValidationError(result, errorMessage));
    }

    if (typeof result.message[key] !== "boolean") {
        return toErrorResult(errorMessage);
    }

    return toSuccessResult({
        type,
        data: { [key]: result.message[key] as boolean },
    } as ValidatedMessage);
}

function validateOptionalTabDataMessage(
    type: "APPLY_RULES_AND_RELOAD_TAB",
    payload: unknown,
    payloadError: string,
    tabIdError: string,
): ValidationResult<ValidatedMessage> {
    if (payload === undefined) {
        return toSuccessResult({ type, data: {} });
    }

    const result = validatePayloadObject(payload, payloadError);
    if (!result.ok) {
        return toErrorResult(getValidationError(result, payloadError));
    }

    if (result.message.tabId !== undefined && !isNonNegativeInteger(result.message.tabId)) {
        return toErrorResult(tabIdError);
    }

    return toSuccessResult({
        type,
        data: { tabId: result.message.tabId as number | undefined },
    });
}

function validateTabDataMessage<T extends "ANALYZE_PAGE_WITH_AI" | "DEFEAT_ADBLOCK_WALL" | "HANDLE_COOKIE_CONSENT">(
    type: T,
    payload: unknown,
    errorMessage: string,
    extraData?: (payload: Record<string, unknown>) => ValidationResult<Record<string, unknown>>,
): ValidationResult<ValidatedMessage> {
    const result = validatePayloadObject(payload, errorMessage);
    if (!result.ok) {
        return toErrorResult(getValidationError(result, errorMessage));
    }

    if (!isNonNegativeInteger(result.message.tabId)) {
        return toErrorResult(errorMessage);
    }

    if (!extraData) {
        return toSuccessResult({
            type,
            data: { tabId: result.message.tabId as number },
        } as ValidatedMessage);
    }

    const extras = extraData(result.message);
    if (!extras.ok) {
        return toErrorResult(getValidationError(extras, errorMessage));
    }

    return toSuccessResult({
        type,
        data: { tabId: result.message.tabId as number, ...extras.message },
    } as ValidatedMessage);
}

function validateSelfHealMessage(payload: unknown): ValidationResult<ValidatedMessage> {
    const errorMessage = "SELF_HEAL_RULE requires data.selector:string and data.pageUrl:string.";
    const result = validatePayloadObject(payload, errorMessage);
    if (!result.ok) {
        return toErrorResult(getValidationError(result, errorMessage));
    }

    const selector = result.message.selector;
    const pageUrl = result.message.pageUrl;
    if (!isNonEmptyString(selector) || !isNonEmptyString(pageUrl)) {
        return toErrorResult(errorMessage);
    }

    return toSuccessResult({
        type: "SELF_HEAL_RULE",
        data: { selector, pageUrl },
    });
}

function validateStringFieldDataMessage<T extends "HIDE_ELEMENT_WITH_AI" | "CLASSIFY_TEXT_LOCALLY">(
    type: T,
    payload: unknown,
    key: string,
    errorMessage: string,
    extraData?: (payload: Record<string, unknown>) => Record<string, unknown>,
): ValidationResult<ValidatedMessage> {
    const result = validatePayloadObject(payload, errorMessage);
    if (!result.ok) {
        return toErrorResult(getValidationError(result, errorMessage));
    }

    const fieldValue = result.message[key];
    if (!isNonEmptyString(fieldValue)) {
        return toErrorResult(errorMessage);
    }

    return toSuccessResult({
        type,
        data: {
            [key]: fieldValue,
            ...(extraData ? extraData(result.message) : {}),
        },
    } as ValidatedMessage);
}

function validateOptionalTabMessage<T extends "GET_NETWORK_LOG" | "CLEAR_NETWORK_LOG" | "GET_PRIVACY_STATS" | "GET_PRIVACY_INSIGHTS">(
    type: T,
    message: Record<string, unknown>,
    errorMessage: string,
    required: boolean,
): ValidationResult<ValidatedMessage> {
    const { tabId } = message;
    if ((required || tabId !== undefined) && !isNonNegativeInteger(tabId)) {
        return toErrorResult(errorMessage);
    }

    return toSuccessResult({
        type,
        tabId: tabId as number | undefined,
    } as ValidatedMessage);
}

function validateSingleStringFieldMessage<T extends "ADD_TO_NETWORK_BLOCKLIST" | "TEMPORARILY_ALLOW_DOMAIN">(
    type: T,
    message: Record<string, unknown>,
    key: string,
    errorMessage: string,
): ValidationResult<ValidatedMessage> {
    const fieldValue = message[key];
    if (!isNonEmptyString(fieldValue)) {
        return toErrorResult(errorMessage);
    }

    if (type === "ADD_TO_NETWORK_BLOCKLIST") {
        const source = message.source;
        if (source !== undefined && !isNetworkBlocklistSource(source)) {
            return toErrorResult(
                `ADD_TO_NETWORK_BLOCKLIST source must be ${NETWORK_BLOCKLIST_SOURCES.join(", ")} when provided.`,
            );
        }

        return toSuccessResult({
            type,
            [key]: fieldValue,
            source,
        } as ValidatedMessage);
    }

    return toSuccessResult({
        type,
        [key]: fieldValue,
    } as ValidatedMessage);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isNonEmptyString);
}

function validateBulkAddRulesMessage(
    type: "BULK_ADD_RULES",
    payload: unknown,
): ValidationResult<ValidatedMessage> {
    const result = validatePayloadObject(payload, "BULK_ADD_RULES requires data object.");
    if (!result.ok) {
        return toErrorResult(getValidationError(result, "BULK_ADD_RULES requires data object."));
    }

    const networkBlocklist = result.message.networkBlocklist;
    const customHidingRules = result.message.customHidingRules;

    if (!isStringArray(networkBlocklist)) {
        return toErrorResult("BULK_ADD_RULES data.networkBlocklist must be string[].");
    }

    if (
        !isObjectLike(customHidingRules)
        || !isNonEmptyString(customHidingRules.domain)
        || !isStringArray(customHidingRules.selectors)
    ) {
        return toErrorResult("BULK_ADD_RULES data.customHidingRules requires domain:string and selectors:string[].");
    }

    return toSuccessResult({
        type,
        data: {
            networkBlocklist,
            customHidingRules: {
                domain: customHidingRules.domain,
                selectors: customHidingRules.selectors,
            },
        },
    });
}

function validateStartFocusModeMessage(
    type: "START_FOCUS_MODE",
    message: Record<string, unknown>,
): ValidationResult<ValidatedMessage> {
    const { duration } = message;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
        return toErrorResult("START_FOCUS_MODE requires duration:number > 0.");
    }

    return toSuccessResult({
        type,
        duration,
    });
}

function validateSimpleType(type: SimpleBackgroundActionMessageType): ValidationResult<ValidatedMessage> {
    return toSuccessResult({ type });
}

export function validateRuntimeMessage(message: unknown): ValidationResult<ValidatedMessage> {
    if (!isObjectLike(message)) {
        return toErrorResult("Invalid message: expected object payload.");
    }

    const { type } = message;
    if (!isSupportedMessageType(type)) {
        return toErrorResult("Invalid message: unsupported type.");
    }

    switch (type) {
        case "GET_PRIVACY_STATS":
            return validateOptionalTabMessage(type, message, "GET_PRIVACY_STATS requires tabId:number.", true);
        case "TOGGLE_GLOBAL_PROTECTION":
            return validateBooleanToggleMessage(
                type,
                message.data,
                "isEnabled",
                "TOGGLE_GLOBAL_PROTECTION requires data.isEnabled:boolean.",
            );
        case "APPLY_RULES_AND_RELOAD_TAB":
            return validateOptionalTabDataMessage(
                type,
                message.data,
                "APPLY_RULES_AND_RELOAD_TAB requires object data.",
                "APPLY_RULES_AND_RELOAD_TAB data.tabId must be a non-negative integer.",
            );
        case "ANALYZE_PAGE_WITH_AI":
            return validateTabDataMessage(
                type,
                message.data,
                "ANALYZE_PAGE_WITH_AI requires data.tabId:number and data.pageUrl:string.",
                (payload) => (
                    isNonEmptyString(payload.pageUrl)
                        ? toSuccessResult({ pageUrl: payload.pageUrl })
                        : toErrorResult("ANALYZE_PAGE_WITH_AI requires data.tabId:number and data.pageUrl:string.")
                ),
            );
        case "HIDE_ELEMENT_WITH_AI":
            return validateStringFieldDataMessage(
                type,
                message.data,
                "description",
                "HIDE_ELEMENT_WITH_AI requires data.description:string.",
                (payload) => ({
                    context: isObjectLike(payload.context) ? payload.context : undefined,
                }),
            );
        case "DEFEAT_ADBLOCK_WALL":
        case "HANDLE_COOKIE_CONSENT":
            return validateTabDataMessage(type, message.data, `${type} requires data.tabId:number.`);
        case "SELF_HEAL_RULE":
            return validateSelfHealMessage(message.data);
        case "GET_NETWORK_LOG":
        case "CLEAR_NETWORK_LOG":
            return validateOptionalTabMessage(
                type,
                message,
                `${type} tabId must be a non-negative integer when provided.`,
                false,
            );
        case "ADD_TO_NETWORK_BLOCKLIST":
        case "TEMPORARILY_ALLOW_DOMAIN":
            return validateSingleStringFieldMessage(
                type,
                message,
                "domain",
                `${type} requires domain:string.`,
            );
        case "BULK_ADD_RULES":
            return validateBulkAddRulesMessage(type, message.data);
        case "GET_PRIVACY_INSIGHTS":
            return validateOptionalTabMessage(type, message, "GET_PRIVACY_INSIGHTS requires tabId:number.", true);
        case "START_FOCUS_MODE":
            return validateStartFocusModeMessage(type, message);
        case "CLASSIFY_TEXT_LOCALLY":
            return validateStringFieldDataMessage(
                type,
                message.data,
                "text",
                "CLASSIFY_TEXT_LOCALLY requires data.text:string.",
            );
        default:
            return isSimpleBackgroundActionMessageType(type)
                ? validateSimpleType(type)
                : toErrorResult("Invalid message: unsupported type.");
    }
}
