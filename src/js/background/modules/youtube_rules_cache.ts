import {
    YOUTUBE_RULES_CACHE_DESCRIPTOR,
    YOUTUBE_RULES_CACHE_KEY,
    YOUTUBE_RULES_DATA_FIELD,
    type YoutubeRulesPayload,
} from "./cache/catalog";
import { ensureLocalJsonCache, getCachedJsonData } from "./cache/json_cache";

let bundledYoutubeRulesPromise: Promise<YoutubeRulesPayload | null> | null = null;

export async function refreshYoutubeRulesCache(forceRefresh = false): Promise<void> {
    await ensureLocalJsonCache(forceRefresh, YOUTUBE_RULES_CACHE_DESCRIPTOR);
}

export async function getCachedYoutubeRules(): Promise<YoutubeRulesPayload | null> {
    return getCachedJsonData<YoutubeRulesPayload>(
        YOUTUBE_RULES_CACHE_KEY,
        YOUTUBE_RULES_DATA_FIELD,
    );
}

export async function getBundledYoutubeRules(): Promise<YoutubeRulesPayload | null> {
    if (!bundledYoutubeRulesPromise) {
        bundledYoutubeRulesPromise = fetch(chrome.runtime.getURL("rules/youtube_rules.json"))
            .then(async (response) => (response.ok ? response.json() : null))
            .catch(() => null);
    }

    return bundledYoutubeRulesPromise;
}

function diffFilters(currentFilters?: string[], bundledFilters?: string[]): string[] {
    if (!currentFilters || currentFilters.length === 0) {
        return [];
    }

    const bundled = new Set(bundledFilters || []);
    return currentFilters.filter((filterValue) => !bundled.has(filterValue));
}

export async function getDynamicYoutubeRuleOverrides(): Promise<YoutubeRulesPayload | null> {
    const [cachedRules, bundledRules] = await Promise.all([
        getCachedYoutubeRules(),
        getBundledYoutubeRules(),
    ]);

    if (!cachedRules) {
        return null;
    }

    const regexFilters = diffFilters(cachedRules.regexFilters, bundledRules?.regexFilters);
    const urlFilters = diffFilters(cachedRules.urlFilters, bundledRules?.urlFilters);

    if (regexFilters.length === 0 && urlFilters.length === 0) {
        return null;
    }

    return {
        regexFilters: regexFilters.length > 0 ? regexFilters : undefined,
        urlFilters: urlFilters.length > 0 ? urlFilters : undefined,
    };
}
