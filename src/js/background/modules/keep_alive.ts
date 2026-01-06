// modules/keep_alive.ts

// The Service Worker idle timer in Chrome is ~30 seconds.
// This module provides a mechanism to keep the SW alive during critical tasks (like AI analysis).

let heartbeatInterval: number | undefined;
const HEARTBEAT_INTERVAL_MS = 20000; // 20 seconds

/**
 * Starts a heartbeat to keep the Service Worker alive.
 * Call this when a long-running operation begins.
 */
export function startKeepAlive(): void {
    if (heartbeatInterval) return; // Already running

    console.log("ZenithGuard: Starting Keep-Alive Heartbeat");

    // Immediate ping
    ping();

    // Periodic ping
    heartbeatInterval = setInterval(ping, HEARTBEAT_INTERVAL_MS) as unknown as number;
}

/**
 * Stops the heartbeat.
 * Call this when the long-running operation ends.
 */
export function stopKeepAlive(): void {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
        console.log("ZenithGuard: Stopped Keep-Alive Heartbeat");
    }
}

/**
 * Performs a trivial API call to reset the Service Worker idle timer.
 */
async function ping(): Promise<void> {
    try {
        // Calling any chrome API resets the idle timer.
        // getPlatformInfo is lightweight.
        await chrome.runtime.getPlatformInfo();
        // console.debug("ZenithGuard: Heartbeat ping");
    } catch (e) {
        console.warn("ZenithGuard: Heartbeat ping failed", e);
    }
}
