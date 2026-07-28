type StorageKeys = string | readonly string[] | null;
type RemovableStorageKeys = string | readonly string[];
type NormalizedStorageKeys = string | string[] | null | undefined;
type StorageGet = (keys?: NormalizedStorageKeys) => Promise<unknown>;
type StorageGetArea = {
    get: StorageGet;
};

function normalizeStorageKeys(keys?: StorageKeys): NormalizedStorageKeys {
    if (typeof keys === "undefined") {
        return undefined;
    }

    if (keys === null) {
        return null;
    }

    if (typeof keys === "string") {
        return keys;
    }

    return [...keys];
}

function normalizeRemovableStorageKeys(keys: RemovableStorageKeys): string | string[] {
    return typeof keys === "string" ? keys : [...keys];
}

export async function getSync<T = unknown>(keys?: StorageKeys): Promise<T> {
    const storage = chrome.storage.sync as StorageGetArea;
    return storage.get(normalizeStorageKeys(keys)) as Promise<T>;
}

export async function getSyncValue<T = unknown>(keys?: StorageKeys): Promise<T> {
    const storage = chrome.storage.sync as StorageGetArea;
    return storage.get(normalizeStorageKeys(keys)) as Promise<T>;
}

export async function setSync(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.sync.set(items);
}

export async function updateSync(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.sync.set(items);
}

export async function removeSync(keys: RemovableStorageKeys): Promise<void> {
    await chrome.storage.sync.remove(normalizeRemovableStorageKeys(keys));
}

export async function getLocal<T = unknown>(keys?: StorageKeys): Promise<T> {
    const storage = chrome.storage.local as StorageGetArea;
    return storage.get(normalizeStorageKeys(keys)) as Promise<T>;
}

export async function getLocalValue<T = unknown>(keys?: StorageKeys): Promise<T> {
    const storage = chrome.storage.local as StorageGetArea;
    return storage.get(normalizeStorageKeys(keys)) as Promise<T>;
}

export async function setLocal(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.local.set(items);
}

export async function updateLocal(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.local.set(items);
}

export async function removeLocal(keys: RemovableStorageKeys): Promise<void> {
    await chrome.storage.local.remove(normalizeRemovableStorageKeys(keys));
}

export async function getSession<T = unknown>(keys?: StorageKeys): Promise<T> {
    const storage = chrome.storage.session as StorageGetArea;
    return storage.get(normalizeStorageKeys(keys)) as Promise<T>;
}

export async function setSession(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.session.set(items);
}

export async function removeSession(keys: RemovableStorageKeys): Promise<void> {
    await chrome.storage.session.remove(normalizeRemovableStorageKeys(keys));
}
