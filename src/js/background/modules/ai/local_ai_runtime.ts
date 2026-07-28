export type LocalAiClassificationResult = {
    isAdRelated: boolean;
    confidence: number;
    error?: string;
};

export type LocalAiClassifier = (text: string) => {
    adScore: number;
    safeScore: number;
};

const MAX_TEXT_LENGTH = 512;
const AD_THRESHOLD = 0.7;
const BASELINE_OFFSET = 0.15;

let classifierInstance: LocalAiClassifier | null = null;

const POSITIVE_SIGNALS = [
    { token: "doubleclick", weight: 0.34 },
    { token: "googlesyndication", weight: 0.32 },
    { token: "googletagmanager", weight: 0.23 },
    { token: "google-analytics", weight: 0.3 },
    { token: "analytics", weight: 0.17 },
    { token: "tracking", weight: 0.22 },
    { token: "telemetry", weight: 0.16 },
    { token: "pixel", weight: 0.18 },
    { token: "beacon", weight: 0.14 },
    { token: "adservice", weight: 0.32 },
    { token: "adsystem", weight: 0.3 },
    { token: "adserver", weight: 0.26 },
    { token: "affiliate", weight: 0.15 },
    { token: "fingerprint", weight: 0.18 },
    { token: "retarget", weight: 0.22 },
    { token: "segment", weight: 0.15 },
    { token: "hotjar", weight: 0.16 },
    { token: "mixpanel", weight: 0.16 },
    { token: "amplitude", weight: 0.16 },
    { token: "script", weight: 0.06 },
    { token: "xhr", weight: 0.04 },
    { token: "fetch", weight: 0.03 },
    { token: "utm_", weight: 0.1 },
    { token: "gclid", weight: 0.18 },
    { token: "fbclid", weight: 0.18 },
];

const NEGATIVE_SIGNALS = [
    { token: "essential website function", weight: 0.36 },
    { token: "main_frame", weight: 0.2 },
    { token: "favicon", weight: 0.18 },
    { token: ".css", weight: 0.1 },
    { token: ".woff", weight: 0.14 },
    { token: ".woff2", weight: 0.16 },
    { token: ".svg", weight: 0.1 },
    { token: "/api/auth", weight: 0.18 },
    { token: "/login", weight: 0.16 },
    { token: "/logout", weight: 0.14 },
    { token: "/checkout", weight: 0.18 },
    { token: "/cart", weight: 0.14 },
    { token: "csrf", weight: 0.14 },
    { token: "nonce", weight: 0.12 },
];

const TRACKER_HOST_SIGNALS = [
    { token: "doubleclick", weight: 0.38 },
    { token: "googlesyndication", weight: 0.36 },
    { token: "google-analytics", weight: 0.35 },
    { token: "googletagmanager", weight: 0.22 },
    { token: "criteo", weight: 0.28 },
    { token: "taboola", weight: 0.24 },
    { token: "outbrain", weight: 0.24 },
    { token: "adnxs", weight: 0.28 },
    { token: "adsrvr", weight: 0.26 },
    { token: "scorecardresearch", weight: 0.3 },
    { token: "segment", weight: 0.18 },
    { token: "mixpanel", weight: 0.2 },
    { token: "hotjar", weight: 0.18 },
];

const CDN_SIGNALS = [
    { token: "cloudflare", weight: 0.24 },
    { token: "bootstrapcdn", weight: 0.22 },
    { token: "jsdelivr", weight: 0.22 },
    { token: "unpkg", weight: 0.2 },
    { token: "gstatic", weight: 0.18 },
    { token: "githubusercontent", weight: 0.16 },
];

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
        return error.message;
    }

    if (typeof error === "string" && error.trim().length > 0) {
        return error;
    }

    return String(error);
}

export function toErrorResponse(error: unknown): { error: string } {
    return { error: getErrorMessage(error) };
}

function readPromptField(text: string, label: string): string | null {
    const match = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
    return !match || !match[1] ? null : match[1].trim().toLowerCase() || null;
}

function extractHostname(url?: string | null): string | null {
    if (!url) {
        return null;
    }

    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
}

function normalizeResourceType(resourceType?: string | null): string {
    if (!resourceType) {
        return "";
    }

    return resourceType === "xmlhttprequest" ? "xhr" : resourceType;
}

function clamp(value: number): number {
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
}

function sumSignalWeights(text: string, entries: Array<{ token: string; weight: number }>): number {
    let total = 0;
    for (const entry of entries) {
        if (text.includes(entry.token)) {
            total += entry.weight;
        }
    }
    return total;
}

function getResourceTypeAdjustment(resourceType: string): number {
    switch (resourceType) {
        case "script":
            return 0.16;
        case "xhr":
        case "fetch":
            return 0.09;
        case "sub_frame":
            return 0.04;
        case "image":
        case "font":
        case "stylesheet":
        case "main_frame":
            return -0.14;
        default:
            return 0;
    }
}

function createClassifier(): LocalAiClassifier {
    return (rawText: string) => {
        const text = rawText.toLowerCase();
        const url = readPromptField(rawText, "url");
        const resourceType = normalizeResourceType(readPromptField(rawText, "type"));
        const domain = readPromptField(rawText, "domain") ?? extractHostname(url);

        const positiveWeight = sumSignalWeights(text, POSITIVE_SIGNALS);
        const negativeWeight = sumSignalWeights(text, NEGATIVE_SIGNALS);
        const trackerHostWeight = domain ? sumSignalWeights(domain, TRACKER_HOST_SIGNALS) : 0;
        const cdnWeight = domain ? sumSignalWeights(domain, CDN_SIGNALS) : 0;
        const typeAdjustment = getResourceTypeAdjustment(resourceType);
        const readableDomain = domain?.replace(/[.\-_]/g, " ") ?? "";
        const domainKeywordBoost = /\b(ad|ads|track|tracking|pixel|beacon|telemetry)\b/.test(readableDomain)
            ? 0.1
            : 0;

        const score = BASELINE_OFFSET
            + positiveWeight
            + trackerHostWeight
            + domainKeywordBoost
            + typeAdjustment
            - negativeWeight
            - cdnWeight;

        const adScore = clamp(1 / (1 + Math.exp(-((score * 1.8) - 0.9))));
        return { adScore, safeScore: 1 - adScore };
    };
}

export async function getClassifier(): Promise<LocalAiClassifier> {
    if (!classifierInstance) {
        classifierInstance = createClassifier();
    }
    return classifierInstance;
}

export async function classifyTextLocally(text: string): Promise<LocalAiClassificationResult> {
    try {
        const input = text.substring(0, MAX_TEXT_LENGTH);
        if (!input.trim()) {
            return { isAdRelated: false, confidence: 0 };
        }

        const classifier = await getClassifier();
        const result = classifier(input);
        const confidence = clamp(result.adScore);

        return {
            isAdRelated: confidence > AD_THRESHOLD,
            confidence,
        };
    } catch (error) {
        return {
            isAdRelated: false,
            confidence: 0,
            error: getErrorMessage(error),
        };
    }
}
