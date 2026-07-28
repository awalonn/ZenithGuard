function asObject(value: unknown): Record<string, unknown> | null {
    return !value || typeof value !== "object" ? null : value as Record<string, unknown>;
}

(() => {
    if ((window as Window & { zenithGuardInterceptor?: boolean }).zenithGuardInterceptor) {
        return;
    }

    (window as Window & { zenithGuardInterceptor?: boolean }).zenithGuardInterceptor = true;

    const playerKeys = ["playerAds", "adPlacements", "adSlots", "adBreakHeartbeatParams", "adBreakParams"];
    const configKeys = ["adRequestConfig", "adParams", "adLoadPolicy"];

    function stripAds(payload: unknown): boolean {
        const record = asObject(payload);
        if (!record) {
            return false;
        }

        let changed = false;

        for (const key of playerKeys) {
            const value = record[key];
            if (Array.isArray(value) && value.length > 0) {
                record[key] = [];
                changed = true;
            } else if (value) {
                record[key] = null;
                changed = true;
            }
        }

        for (const key of configKeys) {
            if (record[key]) {
                record[key] = null;
                changed = true;
            }
        }

        for (const key of ["playerConfig", "playerResponse", "playbackTracking"]) {
            const nested = asObject(record[key]);
            if (!nested) {
                continue;
            }

            for (const nestedKey of configKeys) {
                if (nested[nestedKey]) {
                    nested[nestedKey] = null;
                    changed = true;
                }
            }
        }

        const playbackTracking = asObject(record.playbackTracking);
        if (playbackTracking) {
            for (const key of ["ptrackingUrl", "qoeUrl", "atrUrl", "videostatsPlaybackUrl", "videostatsWatchtimeUrl"]) {
                const nested = asObject(playbackTracking[key]);
                const baseUrl = typeof nested?.baseUrl === "string" ? nested.baseUrl : "";
                if (baseUrl.includes("ad")) {
                    playbackTracking[key] = null;
                    changed = true;
                }
            }
        }

        return changed;
    }

    const nativeFetch = window.fetch;
    window.fetch = async (...args) => {
        const requestUrl = args[0] instanceof Request ? args[0].url : args[0];
        if (typeof requestUrl === "string" && requestUrl.includes("/youtubei/v1/player")) {
            const response = await nativeFetch(...args);
            const cloned = response.clone();
            try {
                const json = await cloned.json();
                if (stripAds(json)) {
                    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
                    return new Response(blob, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                    });
                }
            } catch {
                // Keep original response if parsing fails.
            }

            return response;
        }

        return nativeFetch(...args);
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async?: boolean,
        username?: string | null,
        password?: string | null,
    ): void {
        (this as XMLHttpRequest & { _zgUrl?: string })._zgUrl = String(url);
        nativeOpen.call(this, method, url, async ?? true, username ?? undefined, password ?? undefined);
    };

    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args: Parameters<typeof nativeSend>): void {
        this.addEventListener("load", function () {
            const xhr = this as XMLHttpRequest & { _zgUrl?: string };
            if (!xhr._zgUrl || !xhr._zgUrl.includes("/youtubei/v1/player") || !xhr.responseText) {
                return;
            }

            try {
                const payload = JSON.parse(xhr.responseText);
                if (stripAds(payload)) {
                    const text = JSON.stringify(payload);
                    Object.defineProperty(xhr, "responseText", { value: text, writable: false });
                    Object.defineProperty(xhr, "response", { value: text, writable: false });
                }
            } catch {
                // Ignore invalid JSON payloads.
            }
        });

        nativeSend.apply(this, args);
    };
})();
