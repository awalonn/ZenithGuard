export const VIDEO_AD_REVIEW_REASON = "Allowed video-ad delivery request observed in live traffic";
export const AD_TECH_REVIEW_REASON = "Allowed ad-tech request observed in live traffic";

const AD_TECH_SIGNALS = [
    "adservice",
    "adserver",
    "adsystem",
    "doubleclick",
    "gampad",
    "googleads",
    "googlesyndication",
    "googletagservices",
    "mgid",
    "outbrain",
    "prebid",
    "pubads",
    "securepubads",
    "taboola",
];

const VIDEO_AD_SIGNALS = [
    "/adtag",
    "/adserver",
    "/ads?",
    "/vast",
    "vast.xml",
    "vpaid",
    "imasdk",
    "ima3",
    "preroll",
    "pre-roll",
    "midroll",
    "outstream",
    "instream",
];

export function getAdTechReviewReason(signalText: string): string | null {
    const normalized = signalText.toLowerCase();
    if (VIDEO_AD_SIGNALS.some((signal) => normalized.includes(signal))) {
        return VIDEO_AD_REVIEW_REASON;
    }
    if (AD_TECH_SIGNALS.some((signal) => normalized.includes(signal))) {
        return AD_TECH_REVIEW_REASON;
    }
    return null;
}
