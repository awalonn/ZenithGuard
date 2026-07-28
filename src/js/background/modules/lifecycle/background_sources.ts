import { refreshTrackerMetadataCache } from "../tracker_metadata_cache";
import { refreshYoutubeRulesCache } from "../youtube_rules_cache";
import { refreshMalwareDomainList } from "../malware_feed";

export async function refreshBackgroundSources(forceRefresh = false): Promise<void> {
    await Promise.allSettled([
        refreshMalwareDomainList(),
        refreshYoutubeRulesCache(forceRefresh),
        refreshTrackerMetadataCache(forceRefresh),
    ]);
}
