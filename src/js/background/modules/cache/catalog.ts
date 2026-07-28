import type { JsonCacheDescriptor } from "./json_cache";

export type TrackerDefinition = {
    domains?: string[];
    message?: string;
};

export type TrackerDefinitions = Record<string, TrackerDefinition>;

export type YoutubeRulesPayload = {
    regexFilters?: string[];
    urlFilters?: string[];
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function isValidTrackerDefinitions(value: unknown): value is TrackerDefinitions {
    if (!isObjectLike(value)) {
        return false;
    }

    for (const definition of Object.values(value)) {
        if (!isObjectLike(definition)) {
            return false;
        }

        const domains = definition.domains;
        const message = definition.message;
        if (domains !== undefined && !isStringArray(domains)) {
            return false;
        }
        if (message !== undefined && typeof message !== "string") {
            return false;
        }
    }

    return true;
}

export function isValidYoutubeRulesPayload(value: unknown): value is YoutubeRulesPayload {
    if (!isObjectLike(value)) {
        return false;
    }

    const regexFilters = value.regexFilters;
    const urlFilters = value.urlFilters;

    if (regexFilters !== undefined && !isStringArray(regexFilters)) {
        return false;
    }
    if (urlFilters !== undefined && !isStringArray(urlFilters)) {
        return false;
    }

    return !!(regexFilters || urlFilters);
}

export const TRACKER_METADATA_CACHE_KEY = "tracker-list-cache";
export const TRACKER_METADATA_DATA_FIELD = "list";
export const TRACKER_METADATA_CACHE_DURATION_MS = 1_440 * 60 * 1_000;

export const YOUTUBE_RULES_CACHE_KEY = "youtube-rules-cache";
export const YOUTUBE_RULES_DATA_FIELD = "rules";
export const YOUTUBE_RULES_CACHE_DURATION_MS = 14_400 * 1_000;

export const TRACKER_METADATA_CACHE_DESCRIPTOR: JsonCacheDescriptor<TrackerDefinitions> = {
    label: "tracker list",
    cacheKey: TRACKER_METADATA_CACHE_KEY,
    cacheDurationMs: TRACKER_METADATA_CACHE_DURATION_MS,
    localPath: "rules/trackers.json",
    dataField: TRACKER_METADATA_DATA_FIELD,
    validate: isValidTrackerDefinitions,
};

export const YOUTUBE_RULES_CACHE_DESCRIPTOR: JsonCacheDescriptor<YoutubeRulesPayload> = {
    label: "YouTube ad blocking rules",
    cacheKey: YOUTUBE_RULES_CACHE_KEY,
    cacheDurationMs: YOUTUBE_RULES_CACHE_DURATION_MS,
    localPath: "rules/youtube_rules.json",
    dataField: YOUTUBE_RULES_DATA_FIELD,
    validate: isValidYoutubeRulesPayload,
};
