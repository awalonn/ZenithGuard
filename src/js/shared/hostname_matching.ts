export function hostnamesMatch(left: string | undefined, right: string | undefined): boolean {
    const normalizedLeft = String(left || "").trim().toLowerCase();
    const normalizedRight = String(right || "").trim().toLowerCase();
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    return normalizedLeft === normalizedRight
        || normalizedLeft.endsWith(`.${normalizedRight}`)
        || normalizedRight.endsWith(`.${normalizedLeft}`);
}

export function listHasMatchingHostname(values: string[], hostname: string): boolean {
    return values.some((value) => hostnamesMatch(value, hostname));
}

export function findMatchingStringIndex(values: string[], hostname: string): number {
    return values.findIndex((value) => hostnamesMatch(value, hostname));
}

export function findMatchingRecordEntry<T>(
    entries: Record<string, T> | undefined,
    hostname: string,
): { key: string; value: T } | null {
    if (!entries || typeof entries !== "object") {
        return null;
    }

    for (const [key, value] of Object.entries(entries)) {
        if (hostnamesMatch(key, hostname)) {
            return { key, value };
        }
    }

    return null;
}

export function findMatchingRecordValue<T>(
    entries: Record<string, T> | undefined,
    hostname: string,
): T | null {
    return findMatchingRecordEntry(entries, hostname)?.value || null;
}
