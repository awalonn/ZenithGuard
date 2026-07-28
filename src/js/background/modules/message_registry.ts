import type { ValidatedMessage } from "./message_contracts/validator";
import { BACKGROUND_ACTION_MESSAGE_TYPES } from "../../shared/runtime_messages";

export type BackgroundActionHandler<TType extends ValidatedMessage["type"] = ValidatedMessage["type"]> = (
    message: Extract<ValidatedMessage, { type: TType }>,
    sender: chrome.runtime.MessageSender,
) => Promise<unknown> | unknown;

export type BackgroundActionMap = Partial<{
    [TType in ValidatedMessage["type"]]: BackgroundActionHandler<TType>;
}>;

const EXPECTED_BACKGROUND_ACTIONS: Array<ValidatedMessage["type"]> = [...BACKGROUND_ACTION_MESSAGE_TYPES];

function getMissingActionTypes(registry: BackgroundActionMap): string[] {
    return EXPECTED_BACKGROUND_ACTIONS.filter((type) => !registry[type]);
}

export function combineActionRegistries(...registries: BackgroundActionMap[]): BackgroundActionMap {
    const combined = Object.assign({}, ...registries) as BackgroundActionMap;
    const missing = getMissingActionTypes(combined);
    if (missing.length > 0) {
        throw new Error(`Message action registry missing handlers for: ${missing.join(", ")}`);
    }

    return combined;
}

export function getActionHandler(
    registry: BackgroundActionMap,
    type: ValidatedMessage["type"],
): BackgroundActionHandler {
    const handler = registry[type] as BackgroundActionHandler | undefined;
    if (!handler) {
        throw new Error(`No action handler registered for message type: ${type}`);
    }

    return handler;
}
