import { normalizeDomain } from "../background/modules/storage/defaults";

type HidingRuleLike = {
    value: string;
    enabled?: boolean;
    lastHealed?: number;
    lastHealAttempt?: number;
};

export function getCanonicalSiteBucketKey(value: string): string {
    const candidate = (normalizeDomain(value) || value.trim().toLowerCase()).toLowerCase();
    return candidate.startsWith("www.") ? candidate.slice(4) : candidate;
}

export function normalizeCustomHidingRuleBuckets<T extends HidingRuleLike>(rules: Record<string, T[]> | undefined): Record<string, T[]> {
    const normalized: Record<string, T[]> = {};

    for (const [domain, entries] of Object.entries(rules || {})) {
        const canonical = getCanonicalSiteBucketKey(domain);
        if (!canonical || !Array.isArray(entries)) {
            continue;
        }

        const merged = new Map<string, T>();
        for (const existing of normalized[canonical] || []) {
            merged.set(existing.value, existing);
        }

        for (const entry of entries) {
            if (!entry || typeof entry.value !== "string" || !entry.value.trim()) {
                continue;
            }

            const current = merged.get(entry.value);
            merged.set(entry.value, {
                ...entry,
                enabled: Boolean((current?.enabled ?? false) || entry.enabled),
                ...(typeof current?.lastHealed === "number" && (typeof entry.lastHealed !== "number" || current.lastHealed > entry.lastHealed)
                    ? { lastHealed: current.lastHealed }
                    : {}),
                ...(typeof current?.lastHealAttempt === "number" && (typeof entry.lastHealAttempt !== "number" || current.lastHealAttempt > entry.lastHealAttempt)
                    ? { lastHealAttempt: current.lastHealAttempt }
                    : {}),
            });
        }

        normalized[canonical] = Array.from(merged.values());
    }

    return normalized;
}

export function normalizePersistentWallFixMap<T extends Record<string, unknown>>(values: Record<string, T> | undefined): Record<string, T> {
    const normalized: Record<string, T> = {};

    for (const [domain, fix] of Object.entries(values || {})) {
        const canonical = getCanonicalSiteBucketKey(domain);
        if (!canonical || !fix || typeof fix !== "object") {
            continue;
        }

        normalized[canonical] = normalized[canonical]
            ? {
                ...fix,
                ...normalized[canonical],
            }
            : { ...fix };
    }

    return normalized;
}

export function normalizeTemporaryWallFixMap<T extends Record<string, unknown>>(values: Record<string, T> | undefined): Record<string, T> {
    const normalized: Record<string, T> = {};

    for (const [domain, fix] of Object.entries(values || {})) {
        const canonical = getCanonicalSiteBucketKey(domain);
        if (!canonical || !fix || typeof fix !== "object") {
            continue;
        }

        normalized[canonical] = normalized[canonical]
            ? {
                ...fix,
                ...normalized[canonical],
            }
            : { ...fix };
    }

    return normalized;
}
