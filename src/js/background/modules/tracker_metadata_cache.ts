import {
    TRACKER_METADATA_CACHE_DESCRIPTOR,
    TRACKER_METADATA_CACHE_KEY,
    TRACKER_METADATA_DATA_FIELD,
    type TrackerDefinitions,
} from "./cache/catalog";
import { ensureLocalJsonCache, getCachedJsonData } from "./cache/json_cache";

export async function refreshTrackerMetadataCache(forceRefresh = false): Promise<void> {
    await ensureLocalJsonCache(forceRefresh, TRACKER_METADATA_CACHE_DESCRIPTOR);
}

export async function getCachedTrackerDefinitions(): Promise<TrackerDefinitions | null> {
    return getCachedJsonData<TrackerDefinitions>(
        TRACKER_METADATA_CACHE_KEY,
        TRACKER_METADATA_DATA_FIELD,
    );
}
