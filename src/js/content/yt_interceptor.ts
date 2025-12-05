// src/js/content/yt_interceptor.ts

interface Window {
    zenithGuardInterceptor?: boolean;
}

(() => {
    // Check for a marker to ensure this script only runs once.
    if ((window as any).zenithGuardInterceptor) {
        return;
    }
    (window as any).zenithGuardInterceptor = true;

    const logPrefix = 'ZenithGuard Interceptor:';

    /**
     * Modifies a JSON object to remove known ad-related properties.
     * @param {object} json - The JSON object to clean.
     * @returns {boolean} - True if the object was modified.
     */
    function cleanJsonAds(json: any): boolean {
        let modified = false;
        const adKeys = ['playerAds', 'adPlacements', 'adSlots', 'adBreakHeartbeatParams'];

        for (const key of adKeys) {
            if (json && Array.isArray(json[key]) && json[key].length > 0) {
                console.log(`${logPrefix} Stripping '${key}' from player response.`);
                json[key] = [];
                modified = true;
            } else if (json && json[key]) {
                console.log(`${logPrefix} Nullifying '${key}' from player response.`);
                json[key] = null;
                modified = true;
            }
        }
        return modified;
    }

    // --- Intercept fetch ---
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const url = args[0] instanceof Request ? args[0].url : args[0];

        // Target the primary player API endpoint
        if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
            const response = await originalFetch(...args);
            const clonedResponse = response.clone();

            try {
                const json = await clonedResponse.json();
                if (cleanJsonAds(json)) {
                    // If modified, create a new response with the cleaned data
                    const body = new Blob([JSON.stringify(json)], { type: 'application/json' });
                    return new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
            } catch (e) {
                // Not a JSON response, or parsing failed; proceed with original
            }
            return response;
        }

        return originalFetch(...args);
    };

    // --- Intercept XMLHttpRequest ---
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: any, ...args: any[]) {
        // Store the URL when open is called
        this._zgUrl = args[1];
        originalOpen.apply(this, args as any);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: any, ...args: any[]) {
        this.addEventListener('load', function (this: any) {
            if (this._zgUrl && this._zgUrl.includes('/youtubei/v1/player')) {
                if (this.responseText) {
                    try {
                        const json = JSON.parse(this.responseText);
                        if (cleanJsonAds(json)) {
                            const modifiedText = JSON.stringify(json);
                            // Override the response properties
                            Object.defineProperty(this, 'responseText', { value: modifiedText, writable: false });
                            Object.defineProperty(this, 'response', { value: modifiedText, writable: false });
                        }
                    } catch (e) {
                        // Not a JSON response, or parsing failed; do nothing
                    }
                }
            }
        });
        originalSend.apply(this, args as any);
    };

})();