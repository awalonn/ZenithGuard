function truncateText(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function formatUrlPath(url: URL, includeOrigin: boolean): string {
    const pathname = url.pathname && url.pathname !== "/" ? url.pathname : "";
    const base = includeOrigin ? url.origin : url.hostname;
    return truncateText(`${base}${pathname}`, 120);
}

export function getDisplayUrl(input: string): string {
    try {
        return formatUrlPath(new URL(input), true);
    } catch {
        return truncateText(input.split(/[?#]/, 1)[0] || input, 120);
    }
}

export function getDisplayHostname(input: string): string {
    try {
        return formatUrlPath(new URL(input), false);
    } catch {
        return truncateText(input.split(/[?#]/, 1)[0] || input, 120);
    }
}

export function getAiScanCacheKey(url: string): string {
    return `ai-scan-cache-${encodeURIComponent(getDisplayUrl(url))}`;
}

export function sanitizePromptText(value: string, maxLength = 160): string {
    return truncateText(collapseWhitespace(value).replace(/["`]/g, "'"), maxLength);
}
