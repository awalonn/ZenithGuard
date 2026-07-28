export type GeminiSchemaNode = {
    type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "BOOLEAN";
    properties?: Record<string, GeminiSchemaNode>;
    items?: GeminiSchemaNode;
    required?: string[];
    enum?: string[];
};

const TYPE = {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
    BOOLEAN: "BOOLEAN",
} as const;

const STRING_SCHEMA: GeminiSchemaNode = { type: TYPE.STRING };

const NETWORK_THREAT_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        url: STRING_SCHEMA,
        reason: STRING_SCHEMA,
        severity: STRING_SCHEMA,
        status: STRING_SCHEMA,
    },
    required: ["url", "reason"],
};

const VISUAL_ANNOYANCE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        selector: STRING_SCHEMA,
        reason: STRING_SCHEMA,
        kind: STRING_SCHEMA,
    },
    required: ["selector", "reason"],
};

const HEURISTIC_MATCH_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        keyword: STRING_SCHEMA,
        url: STRING_SCHEMA,
        reason: STRING_SCHEMA,
    },
    required: ["keyword", "url"],
};

const DARK_PATTERN_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        title: STRING_SCHEMA,
        reason: STRING_SCHEMA,
    },
    required: ["title", "reason"],
};

export const ANALYZER_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        networkThreats: { type: TYPE.ARRAY, items: NETWORK_THREAT_SCHEMA },
        visualAnnoyances: { type: TYPE.ARRAY, items: VISUAL_ANNOYANCE_SCHEMA },
        heuristicMatches: { type: TYPE.ARRAY, items: HEURISTIC_MATCH_SCHEMA },
        darkPatterns: { type: TYPE.ARRAY, items: DARK_PATTERN_SCHEMA },
    },
    required: ["networkThreats", "visualAnnoyances", "heuristicMatches", "darkPatterns"],
};

export const HIDE_WITH_AI_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        selector: STRING_SCHEMA,
        reasoning: STRING_SCHEMA,
    },
    required: ["selector"],
};

export const SELF_HEAL_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        reasoning: STRING_SCHEMA,
        newSelector: STRING_SCHEMA,
    },
    required: ["newSelector"],
};

export const WALL_FIX_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        overlaySelector: STRING_SCHEMA,
        overlaySelectors: { type: TYPE.ARRAY, items: STRING_SCHEMA },
        scrollSelector: STRING_SCHEMA,
        contentUnlockSelector: STRING_SCHEMA,
        contentUnlockSelectors: { type: TYPE.ARRAY, items: STRING_SCHEMA },
        reasoning: STRING_SCHEMA,
    },
};

export const COOKIE_CONSENT_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        selector: STRING_SCHEMA,
        action: STRING_SCHEMA,
        reasoning: STRING_SCHEMA,
    },
};

export const NETWORK_SUMMARY_RESPONSE_SCHEMA: GeminiSchemaNode = {
    type: TYPE.OBJECT,
    properties: {
        summary: STRING_SCHEMA,
    },
    required: ["summary"],
};

export const ANALYZER_PROMPT = `Analyze the provided webpage screenshot and network log for privacy threats, visual annoyances, and manipulative dark patterns.
- Network log contains third-party requests observed on the page. Some may already be blocked and some may still be loading.
- Prioritize suspicious analytics, telemetry, pixels, session replay, advertising, fingerprinting, broker, cryptomining, or consent-surveillance traffic.
- Only include strong tracker or ad-tech candidates in networkThreats.
- visualAnnoyances should only include intrusive UI like banners, overlays, sticky promos, or ad containers and must include robust CSS selectors.
- heuristicMatches should only include actionable keywords or URL fragments that look worth blocking.
- darkPatterns should describe manipulative consent, subscription, or urgency UX.
Return strict JSON matching the schema.`;

export function buildHideElementPrompt(description: string, context: Record<string, unknown>): string {
    const contextLines = Object.entries(context || {})
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
        .slice(0, 12)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join("\n");

    return `You are helping hide one intrusive page element.
Requested target: ${description}
${contextLines ? `Context:\n${contextLines}\n` : ""}Based on the screenshot, return one robust CSS selector for the element the user most likely wants to hide.
Prefer stable attributes, data attributes, ids, or structural selectors.
Avoid selectors for html, body, root app containers, and avoid overly broad selectors.`;
}

export function buildSelfHealPrompt(pageUrl: string, oldSelector: string): string {
    return `On the webpage at ${pageUrl}, the following CSS selector was used to hide an unwanted element, but it no longer works: "${oldSelector}".
Based on the screenshot, generate a new robust CSS selector for the same element.
The element is probably an ad, banner, newsletter signup, recommendation rail, or similar annoyance.
Prefer stable attributes and avoid html, body, root app containers, or overly broad selectors.
Return strict JSON.`;
}

export function buildWallFixPrompt(context: {
    pageUrl?: string;
    pageTitle?: string;
    hostname?: string;
    visibleText?: string;
    blockerCandidates?: string[];
    contentCandidates?: string[];
}): string {
    const lines = [
        "You are identifying one paywall, login wall, or blocker overlay on a webpage.",
        "Use the screenshot and compact page context below.",
    ];

    if (context.pageUrl) {
        lines.push(`Page URL: ${context.pageUrl}`);
    }
    if (context.hostname) {
        lines.push(`Hostname: ${context.hostname}`);
    }
    if (context.pageTitle) {
        lines.push(`Page title: ${context.pageTitle}`);
    }
    if (context.visibleText) {
        lines.push(`Visible page text sample:\n${context.visibleText}`);
    }
    if (context.blockerCandidates?.length) {
        lines.push(`Live blocker candidates from the DOM:\n${context.blockerCandidates.join("\n")}`);
    }
    if (context.contentCandidates?.length) {
        lines.push(`Live content candidates from the DOM:\n${context.contentCandidates.join("\n")}`);
    }

    lines.push(
        "Find the blocker UI such as a modal, paywall card, sticky wall, subscription prompt, login gate, or overlay.",
        "If visible, also identify the restricted content wrapper beneath it.",
        "Prefer the live DOM candidates when they fit the screenshot and visible text.",
        "Return:",
        "- overlaySelectors: up to 3 blocker or overlay selector candidates ordered best to worst.",
        "- overlaySelector: the single best blocker selector candidate.",
        "- scrollSelector: the element that needs overflow restored, if obvious.",
        "- contentUnlockSelectors: up to 3 restricted content wrapper candidates ordered best to worst, if obvious.",
        "- contentUnlockSelector: the single best restricted content wrapper candidate, if obvious.",
        "- reasoning: one short explanation.",
        "Prefer a narrow blocker shell selector over a broad article/container selector.",
        "Never return html, body, main, #app, #root, article, section, or * as the overlay selector unless nothing narrower exists.",
        "Return strict JSON.",
    );

    return lines.join("\n");
}

export const COOKIE_CONSENT_PROMPT = `Analyze the provided screenshot for a cookie consent banner or consent wall.
Return the most likely accept or dismiss button selector that would clear the banner with the least intrusive outcome.
- selector: CSS selector for the clickable consent control.
- action: one of "accept", "reject", "dismiss", or "manage" if obvious.
If no clear consent control is visible, return an empty selector.
Never return html, body, root app containers, or a generic container selector.
Return strict JSON.`;

export function buildNetworkSummarySystemPrompt(domain: string): string {
    return `You are summarizing blocked tracker and suspicious network domains for a privacy tool report about ${domain}.
Write a short plain-language summary that explains what kinds of third-party tracking or hostile requests were blocked and why that matters.
Do not overclaim. If the list looks mostly advertising or analytics related, say that.
Return strict JSON with a single summary field.`;
}
