import { normalizeDomain } from "../background/modules/storage/defaults";

export type NetworkBlockMetaLike = {
    source?: string;
    addedAt?: number;
};

export function getCanonicalNetworkBlockMetaKey(value: string): string {
    const candidate = (normalizeDomain(value) || value.trim().toLowerCase()).toLowerCase();
    return candidate.startsWith("www.") ? candidate.slice(4) : candidate;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function normalizeNetworkBlockMeta(value: unknown): NetworkBlockMetaLike | null {
    if (!isObjectLike(value)) {
        return null;
    }

    return {
        ...(typeof value.source === "string" ? { source: value.source } : {}),
        ...(typeof value.addedAt === "number" ? { addedAt: value.addedAt } : {}),
    };
}

export function normalizeNetworkBlocklistMetaRecord(input: unknown): Record<string, NetworkBlockMetaLike> {
    if (!input || typeof input !== "object") {
        return {};
    }

    const normalized: Record<string, NetworkBlockMetaLike> = {};
    for (const [key, rawValue] of Object.entries(input)) {
        const incoming = normalizeNetworkBlockMeta(rawValue);
        if (!incoming) {
            continue;
        }

        const normalizedKey = getCanonicalNetworkBlockMetaKey(key);
        if (!normalizedKey) {
            continue;
        }

        const current = normalized[normalizedKey];
        const currentAddedAt = typeof current?.addedAt === "number" ? current.addedAt : -1;
        const incomingAddedAt = typeof incoming?.addedAt === "number" ? incoming.addedAt : -1;

        normalized[normalizedKey] = incomingAddedAt >= currentAddedAt
            ? { ...incoming }
            : current || { ...incoming };
    }

    return normalized;
}
