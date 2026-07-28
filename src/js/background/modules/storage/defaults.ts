import { getSync, setSync } from "../../../shared/storage_api";

export type ToggleableRule = {
    value: string;
    enabled: boolean;
};

export type ValidationReason =
    | "empty"
    | "invalid"
    | "too_broad"
    | "too_short"
    | "no_signal";

export const MALWARE_CACHE_KEY = "malware-list-cache";
export const MALWARE_DATA_FIELD = "domains";
export const MALWARE_REMOTE_REVISION = "56641ec920b3dda4a62901b7cdd4d6f4cca86ed9";
export const MALWARE_REMOTE_URL = `https://raw.githubusercontent.com/StevenBlack/hosts/${MALWARE_REMOTE_REVISION}/hosts`;
export const MALWARE_SOURCE_LABEL = `StevenBlack hosts feed (${MALWARE_REMOTE_REVISION.slice(0, 7)})`;
export const MALWARE_SEED_PATH = "rules/malware_seed.json";

const FOCUS_MODE_RULE_START_ID = 7_000;

export const FOCUS_MODE_DEFAULT_BLOCKLIST = [
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com",
    "reddit.com",
    "youtube.com",
    "netflix.com",
    "twitch.tv",
    "discord.com",
    "pinterest.com",
    "tumblr.com",
    "9gag.com",
    "imgur.com",
    "buzzfeed.com",
];

const BROAD_DOMAIN_SUFFIXES = new Set([
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "co.jp",
    "com.au",
    "net.au",
    "org.au",
    "com.br",
    "com.mx",
    "com.tr",
    "com.pl",
    "co.in",
]);

const BROAD_HEURISTIC_KEYWORDS = new Set([
    "ads",
    "advert",
    "addelivery",
    "pixel",
    "collect",
    "analyticsjs",
    "metrics",
    "affiliate",
    "telemetry",
    "fingerprint",
]);

export const DEFAULT_BLOCKLIST: ToggleableRule[] = [
    { value: "||doubleclick.net^", enabled: true },
    { value: "||google-analytics.com^", enabled: true },
    { value: "||googletagmanager.com^", enabled: true },
    { value: "||googlesyndication.com^", enabled: true },
    { value: "||facebook.net^", enabled: true },
    { value: "||criteo.com^", enabled: true },
    { value: "||adroll.com^", enabled: true },
    { value: "||rubiconproject.com^", enabled: true },
    { value: "||outbrain.com^", enabled: true },
    { value: "||taboola.com^", enabled: true },
    { value: "||scorecardresearch.com^", enabled: true },
    { value: "||pubmatic.com^", enabled: true },
    { value: "||id5-sync.com^", enabled: true },
    { value: "||hotjar.com^", enabled: true },
    { value: "||fullstory.com^", enabled: true },
    { value: "||logrocket.com^", enabled: true },
    { value: "||inspectlet.com^", enabled: true },
    { value: "||clarity.ms^", enabled: true },
    { value: "||heap.io^", enabled: true },
    { value: "||mouseflow.com^", enabled: true },
    { value: "||smartlook.com^", enabled: true },
    { value: "||clicktale.net^", enabled: true },
    { value: "||sessioncam.com^", enabled: true },
    { value: "||userreplay.net^", enabled: true },
    { value: "||luckyorange.com^", enabled: true },
    { value: "||contentsquare.com^", enabled: true },
    { value: "||glassbox.com^", enabled: true },
    { value: "||quantummetric.com^", enabled: true },
    { value: "||vwo.com^", enabled: true },
    { value: "||amplitude.com^", enabled: true },
    { value: "||mixpanel.com^", enabled: true },
    { value: "||liveramp.com^", enabled: true },
    { value: "||rlcdn.com^", enabled: true },
    { value: "||quantcast.com^", enabled: true },
    { value: "||adnxs.com^", enabled: true },
    { value: "||openx.net^", enabled: true },
    { value: "||indexexchange.com^", enabled: true },
    { value: "||amazon-adsystem.com^", enabled: true },
    { value: "||triplelift.com^", enabled: true },
    { value: "||media.net^", enabled: true },
    { value: "||adform.net^", enabled: true },
    { value: "||smartadserver.com^", enabled: true },
    { value: "||teads.tv^", enabled: true },
    { value: "||magnite.com^", enabled: true },
    { value: "||sovrn.com^", enabled: true },
    { value: "||fingerprint.com^", enabled: true },
    { value: "||fingerprintjs.com^", enabled: true },
    { value: "||threatmetrix.com^", enabled: true },
    { value: "||iovation.com^", enabled: true },
    { value: "||sift.com^", enabled: true },
    { value: "||deviceatlas.com^", enabled: true },
    { value: "||adskeeper.co.uk^", enabled: true },
    { value: "||adskeeper.co^", enabled: true },
    { value: "||adskeeper.online^", enabled: true },
    { value: "||engage.adskeeper.com^", enabled: true },
    { value: "||mgid.com^", enabled: true },
    { value: "||mgid.co^", enabled: true },
    { value: "||mgid.online^", enabled: true },
    { value: "||revcontent.com^", enabled: true },
    { value: "||acxiom.com^", enabled: true },
    { value: "||neustar.biz^", enabled: true },
    { value: "||epsilon.com^", enabled: true },
    { value: "||coinhive.com^", enabled: true },
    { value: "||coin-hive.com^", enabled: true },
    { value: "||crypto-loot.com^", enabled: true },
    { value: "||minero.pw^", enabled: true },
    { value: "||authedmine.com^", enabled: true },
    { value: "||webminepool.com^", enabled: true },
    { value: "||monerohash.com^", enabled: true },
    { value: "||51.la^", enabled: true },
    { value: "||peopledatalabs.com^", enabled: true },
    { value: "||platform.twitter.com^", enabled: true },
    { value: "||platform.instagram.com^", enabled: true },
    { value: "||widgets.pinterest.com^", enabled: true },
    { value: "||buffer.com^", enabled: true },
    { value: "||infotracer.com^", enabled: true },
    { value: "||spokeo.com^", enabled: true },
    { value: "||beenverified.com^", enabled: true },
    { value: "||intelius.com^", enabled: true },
    { value: "||peoplefinders.com^", enabled: true },
    { value: "||truthfinder.com^", enabled: true },
    { value: "||whitepages.com^", enabled: true },
    { value: "adservice.", enabled: true },
    { value: "adserver.", enabled: true },
    { value: "prebid.", enabled: true },
    { value: "clickserve.", enabled: true },
    { value: "adskeeper.", enabled: true },
    { value: "mgid.", enabled: true },
    { value: "revcontent.", enabled: true },
    { value: "plista.", enabled: true },
    { value: "ligatus.", enabled: true },
    { value: "||googletagservices.com^", enabled: true },
    { value: "||securepubads.g.doubleclick.net^", enabled: true },
    { value: "||tpc.googlesyndication.com^", enabled: true },
    { value: "gampad/", enabled: true },
    { value: "pubads_impl", enabled: true },
    { value: "prebid-min.js", enabled: true },
    { value: "||imasdk.googleapis.com^", enabled: true },
    { value: "||marketplace.anyclip.com^", enabled: true },
    { value: "||adsrvr.org^", enabled: true },
    { value: "||lijit.com^", enabled: true },
    { value: "||onetag-sys.com^", enabled: true },
    { value: "||bordeaux.futurecdn.net^", enabled: true },
    { value: "||servebom.com^", enabled: true },
    { value: "||sharethrough.com^", enabled: true },
    { value: "||3lift.com^", enabled: true },
    { value: "||casalemedia.com^", enabled: true },
    { value: "||omnitagjs.com^", enabled: true },
    { value: "||bidswitch.net^", enabled: true },
    { value: "||yellowblue.io^", enabled: true },
    { value: "||33across.com^", enabled: true },
    { value: "||everesttech.net^", enabled: true },
    { value: "||liadm.com^", enabled: true },
    { value: "||thrtle.com^", enabled: true },
    { value: "prebid-current.js", enabled: true },
    { value: "prebid-config", enabled: true },
    { value: "||ay.delivery^", enabled: true },
    { value: "bidbarrel", enabled: true },
    { value: "||confiant-integrations.net^", enabled: true },
    { value: "||ml314.com^", enabled: true },
    { value: "||crwdcntrl.net^", enabled: true },
    { value: "||ims-v4.paramount.tech^", enabled: true },
    { value: "||aniview.com^", enabled: true },
    { value: "||fwmrm.net^", enabled: true },
    { value: "||adsafeprotected.com^", enabled: true },
    { value: "||trustx.org^", enabled: true },
    { value: "||smaato.net^", enabled: true },
    { value: "||colossusssp.com^", enabled: true },
    { value: "player.ex.co/prebid-bundle", enabled: true },
    { value: "||sync.ex.co^", enabled: true },
    { value: "||kargo.com^", enabled: true },
    { value: "||gumgum.com^", enabled: true },
    { value: "||postrelease.com^", enabled: true },
    { value: "||servenobid.com^", enabled: true },
    { value: "||smilewanted.com^", enabled: true },
    { value: "||skimresources.com^", enabled: true },
    { value: "freewheel.js", enabled: true },
    { value: "||video-ads-module.ad-tech.nbcuni.com^", enabled: true },
    { value: "||adsninja.ca^", enabled: true },
    { value: "||brid.tv^", enabled: true },
    { value: "||permutive.com^", enabled: true },
    { value: "||permutive.app^", enabled: true },
    { value: "||criteo.net^", enabled: true },
    { value: "||ads-configs-cdn.openweb.com^", enabled: true },
    { value: "||dotomi.com^", enabled: true },
    { value: "||tapad.com^", enabled: true },
    { value: "||uidapi.com^", enabled: true },
    { value: "||lngtdv.com^", enabled: true },
    { value: "||adentifi.com^", enabled: true },
    { value: "||ipredictive.com^", enabled: true },
    { value: "||tsyndicate.com^", enabled: true },
    { value: "||mc.yandex.ru^", enabled: true },
    { value: "||mc.webvisor.org^", enabled: true },
    { value: "||rtbsuperhub.com^", enabled: true },
    { value: "||coosync.com^", enabled: true },
    { value: "||aj2555.bid^", enabled: true },
    { value: "dailymail.com/static/mol-adverts/", enabled: true },
    { value: "||idsync.anm.co.uk^", enabled: true },
    { value: "||idsync.dailymail.com^", enabled: true },
    { value: "||stackadapt.com^", enabled: true },
    { value: "||visualwebsiteoptimizer.com^", enabled: true },
    { value: "||cds.connatix.com^", enabled: true },
    { value: "||capi.connatix.com^", enabled: true },
    { value: "||ins.connatix.com^", enabled: true },
    { value: "||htlbid.com^", enabled: true },
    { value: "||sitescout.com^", enabled: true },
    { value: "||analytics.tiktok.com^", enabled: true },
    { value: "||mon.tiktokv.com^", enabled: true },
    { value: "||mcs-sg.tiktokv.com^", enabled: true },
    { value: "||chartbeat.com^", enabled: true },
    { value: "||chartbeat.net^", enabled: true },
    { value: "||merequartz.com^", enabled: true },
    { value: "||html-load.com^", enabled: true },
    { value: "||optmn.cloud^", enabled: true },
    { value: "||p7cloud.net^", enabled: true },
    { value: "||zipthelake.com^", enabled: true },
    { value: "strike.fox.com/static/tmz/display/loader.js", enabled: true },
    { value: "||primis.tech^", enabled: true },
    { value: "||bouncex.net^", enabled: true },
    { value: "||bounceexchange.com^", enabled: true },
    { value: "||ad-delivery.net^", enabled: true },
    { value: "||btloader.com^", enabled: true },
    { value: "||eyeota.net^", enabled: true },
    { value: "||wknd.ai^", enabled: true },
    { value: "||analytics.yahoo.com^", enabled: true },
    { value: "||inmobi.com^", enabled: true },
    { value: "||aaxads.com^", enabled: true },
    { value: "||tremorhub.com^", enabled: true },
    { value: "||adthrive.com^", enabled: true },
    { value: "||quantserve.com^", enabled: true },
    { value: "||adrecover.com^", enabled: true },
    { value: "||ad.gt^", enabled: true },
    { value: "||adspsp.com^", enabled: true },
    { value: "||ads-twitter.com^", enabled: true },
    { value: "redditstatic.com/ads/", enabled: true },
    { value: "||pixel-config.reddit.com^", enabled: true },
    { value: "||alb.reddit.com^", enabled: true },
    { value: "||googleadservices.com^", enabled: true },
    { value: "||dv.tech^", enabled: true },
    { value: "||zdbb.net^", enabled: true },
    { value: "||getadmiral.com^", enabled: true },
    { value: "||optidigital.com^", enabled: true },
    { value: "||opti-digital.com^", enabled: true },
    { value: "||presage.io^", enabled: true },
    { value: "||seedtag.com^", enabled: true },
    { value: "||adx.opera.com^", enabled: true },
    { value: "||oa.opera.com^", enabled: true },
    { value: "temu.com/api/adx/cm/pixel-opera", enabled: true },
    { value: "||demdex.net^", enabled: true },
    { value: "||sddan.com^", enabled: true },
    { value: "||richaudience.com^", enabled: true },
    { value: "||1rx.io^", enabled: true },
    { value: "cdn.jsdelivr.net/gh/prebid/currency-file", enabled: true },
    { value: "||deepintent.com^", enabled: true },
    { value: "spot.im/production/ads/", enabled: true },
    { value: "spot.im/ad/event-tracking/", enabled: true },
    { value: "bing.com/api/v1/mediation/tracking", enabled: true },
    { value: "||px.ads.linkedin.com^", enabled: true },
    { value: "||grok.com/_data/v1/events^", enabled: true },
    { value: "||grok.com/api/log_metric^", enabled: true },
    { value: "||grok.com/_data/v1/a/t^", enabled: true },
    { value: "||grok.com/_data/v1/a/engage^", enabled: true },
    { value: "||grok.com/_data/v1/a/record^", enabled: true },
    { value: "||grok.com/monitoring^", enabled: true },
];

export const YOUTUBE_CORE_URL_FILTERS = [
    "/ad-delivery/",
    "/ads/banner.",
    "pagead/",
    "pixelsync",
    "clck.",
    "jsc.",
    "servicerole.com",
    "||connect.facebook.net^",
    "clickserve",
    "adskeeper",
    "mgid",
    "revcontent",
    "plista",
    "ligatus",
];

export const DEFAULT_HEURISTIC_KEYWORDS = [
    "third-party-ads",
    "/track.js",
    "/tracking.",
    "/beacon.",
    "track.gif",
    "/usersync",
    "/cookie-sync",
    "user-identification",
    "popunder",
    "adloader",
    "offer-wall",
];

export const REMOVED_HEURISTIC_KEYWORDS = [
    "adserver.",
    "adservice.",
    "prebid",
    "doubleclick",
    "/ads/",
    "-ads-",
    "_ads_",
    "/advert/",
    "ad-delivery",
    "/pixel.",
    "/collect?",
    "analytics.js",
    "metrics.",
    "affiliate",
    "telemetry",
    "fingerprint",
];

export function getDefaultBlocklistEntries(): ToggleableRule[] {
    return DEFAULT_BLOCKLIST.map((rule) => ({ value: rule.value, enabled: rule.enabled }));
}

function coerceToggleableRule(value: unknown): ToggleableRule | null {
    if (typeof value === "string" && value.trim()) {
        return { value: value.trim(), enabled: true };
    }

    if (!value || typeof value !== "object") {
        return null;
    }

    const rule = value as { value?: unknown; enabled?: unknown };
    if (typeof rule.value !== "string" || !rule.value.trim()) {
        return null;
    }

    return {
        value: rule.value.trim(),
        enabled: rule.enabled !== false,
    };
}

export function getDefaultBlocklistOverrides(values: unknown): ToggleableRule[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const defaultRuleValues = new Set(DEFAULT_BLOCKLIST.map((rule) => rule.value));
    const disabledRules = new Set<string>();

    for (const rawValue of values) {
        const rule = coerceToggleableRule(rawValue);
        if (!rule || !defaultRuleValues.has(rule.value)) {
            continue;
        }

        if (rule.enabled === false) {
            disabledRules.add(rule.value);
        } else {
            disabledRules.delete(rule.value);
        }
    }

    return DEFAULT_BLOCKLIST
        .filter((rule) => disabledRules.has(rule.value))
        .map((rule) => ({ value: rule.value, enabled: false }));
}

export function getEffectiveDefaultBlocklistEntries(values: unknown): ToggleableRule[] {
    const disabledRules = new Set(getDefaultBlocklistOverrides(values).map((rule) => rule.value));
    return DEFAULT_BLOCKLIST.map((rule) => ({
        value: rule.value,
        enabled: rule.enabled !== false && !disabledRules.has(rule.value),
    }));
}

export function getDefaultHeuristicKeywordEntries(): ToggleableRule[] {
    return DEFAULT_HEURISTIC_KEYWORDS.map((value) => ({ value, enabled: true }));
}

export function getMinimalSyncDefaults() {
    return {
        isProtectionEnabled: true,
        isYouTubeAdBlockingEnabled: true,
        isHeuristicEngineEnabled: true,
        defaultBlocklist: [],
        heuristicKeywords: getDefaultHeuristicKeywordEntries(),
    };
}

export function getInitialSettingsSnapshot() {
    return {
        isProtectionEnabled: true,
        isNextGenAIEradicatorEnabled: true,
        isHeuristicEngineEnabled: true,
        isUrlCleanerEnabled: true,
        isMalwareProtectionEnabled: true,
        isYouTubeAdBlockingEnabled: true,
        isSandboxedIframeEnabled: true,
        isCookieBannerHidingEnabled: false,
        isSelfHealingEnabled: false,
        isPerformanceModeEnabled: false,
        isBreachWarningEnabled: true,
        theme: "dark",
        defaultBlocklist: [],
        heuristicKeywords: getDefaultHeuristicKeywordEntries(),
        networkBlocklist: [],
        customHidingRules: {},
        heuristicAllowlist: [],
        isolationModeSites: [],
        forgetfulSites: [],
        settingsInitialized: true,
    };
}

function looksLikeRegexFragment(value: string): boolean {
    return value.startsWith("/") && (value.endsWith("/") || value.endsWith("/i"));
}

function isIpv4Address(value: string): boolean {
    const parts = value.split(".");
    return parts.length === 4 && parts.every((part) => {
        if (!/^\d+$/.test(part)) {
            return false;
        }
        const segment = Number(part);
        return segment >= 0 && segment <= 255;
    });
}

function isHostname(value: string): boolean {
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
}

function extractHostname(value: string): string | null {
    try {
        return new URL(value).hostname;
    } catch {
        return null;
    }
}

function trimRuleDecorators(value: string): string {
    let normalized = value.trim().toLowerCase();
    normalized = normalized.replace(/^\*:\/\//, "https://");
    if (normalized.startsWith("||")) {
        normalized = normalized.slice(2);
    }
    normalized = normalized.replace(/\^+$/, "");
    normalized = normalized.replace(/^(?:\*|%2a)\./, "");
    normalized = normalized.replace(/^\./, "");
    normalized = normalized.replace(/\s+/g, "");
    return normalized;
}

function trimHostnameDecorators(value: string): string {
    return value
        .replace(/^(?:\*|%2a)\./i, "")
        .replace(/^\./, "")
        .replace(/\.+$/, "");
}

export function normalizeDomain(value: string): string | null {
    const normalized = trimRuleDecorators(value);
    if (!normalized || looksLikeRegexFragment(normalized)) {
        return null;
    }

    let hostname = extractHostname(normalized);
    if (!hostname && normalized.startsWith("//")) {
        hostname = extractHostname(`https:${normalized}`);
    }
    if (!hostname) {
        hostname = extractHostname(`https://${normalized}`);
    }

    const candidate = trimHostnameDecorators((hostname || normalized.split(/[/?#]/, 1)[0] || "")
        .replace(/:\d+$/, ""));

    if (!candidate) {
        return null;
    }

    if (candidate === "localhost" || isIpv4Address(candidate) || isHostname(candidate)) {
        return candidate;
    }

    return null;
}

export function validateNetworkRuleValue(value: string): { normalizedValue: string | null; reason: ValidationReason | null } {
    if (!value.trim()) {
        return { normalizedValue: null, reason: "empty" };
    }

    const normalized = normalizeDomain(value);
    if (!normalized) {
        return { normalizedValue: null, reason: "invalid" };
    }

    if (BROAD_DOMAIN_SUFFIXES.has(normalized)) {
        return { normalizedValue: null, reason: "too_broad" };
    }

    return { normalizedValue: normalized, reason: null };
}

export function getNetworkRuleValidationMessage(reason: ValidationReason | null): string {
    switch (reason) {
        case "too_broad":
            return "That domain is too broad to block safely. Add a more specific host instead of a public-suffix style domain.";
        case "invalid":
            return "Enter a valid domain, URL, or ||domain^ rule.";
        case "empty":
        default:
            return "Enter a domain first.";
    }
}

export function normalizeNetworkRuleValue(value: string): string | null {
    return validateNetworkRuleValue(value).normalizedValue;
}

export function validateHeuristicKeyword(value: string): { normalizedValue: string | null; reason: ValidationReason | null } {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return { normalizedValue: null, reason: "empty" };
    }

    const compact = trimmed.replace(/\s+/g, " ");
    const alphanumeric = compact.replace(/[^a-z0-9]/g, "");
    const hasSeparator = /[./?=_-]/.test(compact);
    const hasDigit = /\d/.test(compact);

    if (!alphanumeric) {
        return { normalizedValue: null, reason: "no_signal" };
    }

    if (BROAD_HEURISTIC_KEYWORDS.has(alphanumeric)) {
        return { normalizedValue: null, reason: "too_broad" };
    }

    if (alphanumeric.length < 4 && !hasSeparator && !hasDigit) {
        return { normalizedValue: null, reason: "too_short" };
    }

    return { normalizedValue: compact, reason: null };
}

export function getHeuristicValidationMessage(reason: ValidationReason | null): string {
    switch (reason) {
        case "too_broad":
            return "That keyword is too broad. Use a more specific ad-tech or tracking marker like '/usersync', '/tracking.', or 'third-party-ads'.";
        case "too_short":
            return "That keyword is too short to be safe on its own. Add more context, like a path fragment or a more specific term.";
        case "no_signal":
            return "That keyword doesn't contain enough usable signal. Try a concrete tracking or ad-tech marker instead.";
        case "empty":
        default:
            return "Enter a heuristic keyword first.";
    }
}

export function normalizeHeuristicKeywordValue(value: string): string | null {
    return validateHeuristicKeyword(value).normalizedValue;
}

export function dedupeDomainStrings(values: string[]): string[] {
    const deduped = new Set<string>();
    for (const value of values) {
        const normalized = normalizeDomain(String(value));
        if (normalized) {
            deduped.add(normalized);
        }
    }
    return Array.from(deduped);
}

export function normalizeDomainRuleEntries(entries: ToggleableRule[]): ToggleableRule[] {
    const rulesByDomain = new Map<string, ToggleableRule>();
    for (const entry of entries || []) {
        const normalized = normalizeDomain(String(entry.value));
        if (!normalized) {
            continue;
        }
        const current = rulesByDomain.get(normalized);
        rulesByDomain.set(normalized, {
            value: normalized,
            enabled: (current?.enabled || false) || entry.enabled,
        });
    }
    return Array.from(rulesByDomain.values());
}

export function normalizeHeuristicRuleEntries(entries: ToggleableRule[]): ToggleableRule[] {
    const rulesByKeyword = new Map<string, ToggleableRule>();
    for (const entry of entries || []) {
        const normalized = normalizeHeuristicKeywordValue(String(entry.value));
        if (!normalized) {
            continue;
        }
        const current = rulesByKeyword.get(normalized);
        rulesByKeyword.set(normalized, {
            value: normalized,
            enabled: (current?.enabled || false) || entry.enabled,
        });
    }
    return Array.from(rulesByKeyword.values());
}

export async function createFocusModeRules(): Promise<chrome.declarativeNetRequest.Rule[]> {
    const settings = await getSync<{
        isFocusModeEnabled?: boolean;
        focusModeUntil?: number;
        focusBlocklist?: string[];
    }>(["isFocusModeEnabled", "focusModeUntil", "focusBlocklist"]);

    if (!settings.focusModeUntil || settings.focusModeUntil < Date.now()) {
        if (settings.isFocusModeEnabled) {
            await setSync({ isFocusModeEnabled: false });
        }
        return [];
    }

    const domains = settings.focusBlocklist && settings.focusBlocklist.length > 0
        ? settings.focusBlocklist
        : FOCUS_MODE_DEFAULT_BLOCKLIST;

    return domains.map((domain, index) => {
        const normalizedDomain = normalizeDomain(domain) || domain;
        const requestDomains = normalizedDomain.startsWith("www.")
            ? [normalizedDomain, normalizedDomain.replace(/^www\./, "")]
            : [normalizedDomain, `www.${normalizedDomain}`];

        return ({
        id: FOCUS_MODE_RULE_START_ID + index,
        priority: 1,
        action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { extensionPath: "/src/pages/focus_blocked.html" },
        },
        condition: {
            requestDomains,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
        });
    });
}

export async function startFocusMode(durationMinutes: number): Promise<void> {
    const focusModeUntil = Date.now() + (durationMinutes * 60 * 1_000);
    await setSync({ isFocusModeEnabled: true, focusModeUntil });
}

export async function stopFocusMode(): Promise<void> {
    await setSync({ isFocusModeEnabled: false, focusModeUntil: 0 });
}
