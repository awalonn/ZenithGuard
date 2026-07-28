export const RULE_RELATED_SYNC_KEYS = [
    "networkBlocklist",
    "customHidingRules",
    "persistentWallFixes",
    "heuristicKeywords",
    "defaultBlocklist",
    "disabledSites",
    "isolationModeSites",
    "isHeuristicEngineEnabled",
    "isUrlCleanerEnabled",
    "isMalwareProtectionEnabled",
    "isYouTubeAdBlockingEnabled",
    "isProtectionEnabled",
    "forgetfulSites",
] as const;

export const FOCUS_RELATED_SYNC_KEYS = [
    "isFocusModeEnabled",
    "focusModeUntil",
    "focusBlocklist",
] as const;

function hasChangedKey(
    changes: Record<string, chrome.storage.StorageChange>,
    keys: readonly string[],
): boolean {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(changes, key));
}

export type SettingsRuntimeDeps = {
    applyRules: () => Promise<void>;
    reapplyHidingRules: () => Promise<void>;
};

export function attachSettingsRuntime(deps: SettingsRuntimeDeps): void {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== "sync") {
            return;
        }

        const hasRuleChanges = hasChangedKey(changes, RULE_RELATED_SYNC_KEYS);
        const hasFocusChanges = hasChangedKey(changes, FOCUS_RELATED_SYNC_KEYS);

        if (!hasRuleChanges && !hasFocusChanges) {
            return;
        }

        if (hasRuleChanges) {
            console.info("ZenithGuard: Rule-related setting changed. Re-applying all rules.");
        }

        await deps.applyRules();
        if (hasRuleChanges) {
            await deps.reapplyHidingRules();
        }
    });
}
