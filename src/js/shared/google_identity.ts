const GOOGLE_IDENTITY_HOSTNAME = "accounts.google.com";

export function isGoogleIdentityHostname(hostname: string | null | undefined): boolean {
    return String(hostname || "").trim().toLowerCase().replace(/\.$/, "") === GOOGLE_IDENTITY_HOSTNAME;
}

export function isGoogleIdentityUrl(
    value: string | URL | null | undefined,
    baseUrl: string,
): boolean {
    const candidate = String(value || "").trim();
    if (!candidate) {
        return false;
    }

    try {
        const parsed = new URL(candidate, baseUrl);
        return parsed.protocol === "https:" && isGoogleIdentityHostname(parsed.hostname);
    } catch {
        return false;
    }
}
