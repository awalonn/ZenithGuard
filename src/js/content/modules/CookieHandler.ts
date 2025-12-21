
export class CookieHandler {
    constructor() { }

    public runAICookieHandler() {
        setTimeout(async () => {
            if (!this.shouldRunAICookieCheck()) {
                return;
            }

            // --- PER-DOMAIN DEBOUNCE / COOLDOWN FIX ---
            const domain = window.location.hostname;
            const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours per domain for auto-runs
            const { lastAICookieChecks = {} } = await chrome.storage.local.get('lastAICookieChecks') as any;
            const now = Date.now();

            if (lastAICookieChecks[domain] && (now - lastAICookieChecks[domain] < COOLDOWN_MS)) {
                console.log(`ZenithGuard: AI Cookie check for ${domain} is on 24h cooldown.`);
                return;
            }

            console.log(`ZenithGuard: Initiating AI Cookie check for ${domain}...`);
            try {
                // Update cooldown anchor for this domain immediately
                lastAICookieChecks[domain] = now;
                await chrome.storage.local.set({ 'lastAICookieChecks': lastAICookieChecks });

                const response = await chrome.runtime.sendMessage({ type: 'HANDLE_COOKIE_CONSENT' });
                if (response.error) {
                    if (response.error !== 'TAB_CLOSED' && response.error !== 'QUOTA_EXCEEDED') {
                        console.log(`ZenithGuard AI Cookie Consent: ${response.error}`);
                    }
                    return;
                }

                const { selector, action } = response.result;
                if (!selector) return;

                try {
                    const element = document.querySelector(selector) as HTMLElement;
                    if (element && this.isElementVisible(element)) {
                        element.click();
                        const message = action === 'REJECT' ?
                            'AI rejected tracking cookies for you.' :
                            'AI accepted cookies for you.';
                        this.showToast({ message });
                    }
                } catch (e: any) {
                    // Ignore invalid selector
                }

            } catch (error: any) {
                // Ignore network errors
            }
        }, 2000);
    }

    private shouldRunAICookieCheck(): boolean {
        const bodyText = document.body.innerText.toLowerCase().substring(0, 5000) + document.body.innerText.toLowerCase().slice(-5000);
        const keywords = ['cookie', 'consent', 'accept', 'agree', 'privacy policy', 'gdpr'];
        return keywords.some(k => bodyText.includes(k));
    }

    private isElementVisible(el: HTMLElement) {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    private showToast(options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) {
        if ((window as any).ZenithGuardToastUtils && (window as any).ZenithGuardToastUtils.showToast) {
            (window as any).ZenithGuardToastUtils.showToast(options);
        }
    }
}
