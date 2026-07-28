import { getLocal, setLocal } from "../../../shared/storage_api";

export type JsonCacheRecord<T> = {
    lastUpdated: number;
} & Record<string, T>;

export type JsonCacheDescriptor<T> = {
    label: string;
    cacheKey: string;
    cacheDurationMs: number;
    localPath: string;
    dataField: string;
    validate: (value: unknown) => value is T;
};

export type RemoteTextCacheDescriptor<T> = {
    label: string;
    cacheKey: string;
    dataField: string;
    remoteUrl: string;
    parse: (text: string) => T;
    validate?: (value: T) => boolean;
    timeoutMs?: number;
};

export class RemoteCacheHttpError extends Error {
    constructor(public readonly status: number) {
        super(`HTTP error! status: ${status}`);
        this.name = "RemoteCacheHttpError";
    }
}

function isFresh(record: JsonCacheRecord<unknown> | undefined, maxAgeMs: number): boolean {
    return !!record
        && typeof record.lastUpdated === "number"
        && Date.now() - record.lastUpdated < maxAgeMs;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object";
}

function toCacheRecord<T>(value: unknown): JsonCacheRecord<T> | undefined {
    if (isObjectLike(value) && typeof value.lastUpdated === "number") {
        return value as JsonCacheRecord<T>;
    }
    return undefined;
}

export async function getCachedRecord<T>(cacheKey: string): Promise<JsonCacheRecord<T> | undefined> {
    const result = await getLocal<Record<string, unknown>>(cacheKey);
    return toCacheRecord<T>(result[cacheKey]);
}

export async function setCachedRecord<T>(cacheKey: string, dataField: string, value: T): Promise<void> {
    await setLocal({
        [cacheKey]: {
            [dataField]: value,
            lastUpdated: Date.now(),
        },
    });
}

export async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

export async function loadLocalFallbackIntoCache<T>(
    forceRefresh: boolean,
    descriptor: JsonCacheDescriptor<T>,
): Promise<void> {
    const record = await getCachedRecord<T>(descriptor.cacheKey);

    if (!forceRefresh && isFresh(record, descriptor.cacheDurationMs)) {
        return;
    }

    try {
        const localUrl = chrome.runtime.getURL(descriptor.localPath);
        const payload = await fetchJson<T>(localUrl);
        if (!descriptor.validate(payload)) {
            throw new Error("Local fallback payload invalid.");
        }

        await setCachedRecord(descriptor.cacheKey, descriptor.dataField, payload);
    } catch (error) {
        console.error(`ZenithGuard: Failed to load local fallback ${descriptor.label}.`, error);
    }
}

export async function ensureLocalJsonCache<T>(
    forceRefresh: boolean,
    descriptor: JsonCacheDescriptor<T>,
): Promise<void> {
    await loadLocalFallbackIntoCache(forceRefresh, descriptor);
}

export async function getCachedJsonData<T>(
    cacheKey: string,
    dataField: string,
): Promise<T | null> {
    const record = await getCachedRecord<T>(cacheKey);
    if (!record) {
        return null;
    }

    const value = record[dataField];
    return value === undefined ? null : (value as T);
}

export async function updateRemoteTextCache<T>(descriptor: RemoteTextCacheDescriptor<T>): Promise<void> {
    try {
        const response = await fetch(descriptor.remoteUrl, {
            signal: AbortSignal.timeout(descriptor.timeoutMs ?? 30_000),
        });

        if (!response.ok) {
            throw new RemoteCacheHttpError(response.status);
        }

        const text = await response.text();
        const parsed = descriptor.parse(text);
        if (descriptor.validate && !descriptor.validate(parsed)) {
            throw new Error(`Parsed ${descriptor.label} payload is invalid.`);
        }

        await setCachedRecord(descriptor.cacheKey, descriptor.dataField, parsed);
    } catch (error) {
        console.warn(`ZenithGuard: Could not refresh ${descriptor.label}; using cached or bundled data.`, error);
    }
}
