
export class SecurityGuard {
    private isBreachedSite: boolean = false;

    constructor() { }

    public setBreached(value: boolean) {
        this.isBreachedSite = value;
        if (value) {
            this.showBreachWarningBanner();
        }
    }

    public attachPasswordMonitor() {
        document.addEventListener('focusin', (e) => {
            const target = e.target as HTMLElement;
            if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password') {
                if (this.isBreachedSite) {
                    this.showToast({
                        message: "Warning: This site has a known data breach. Do not re-use an old password!",
                        type: "error",
                        duration: 6000
                    });
                }
            }
        });
    }

    private showBreachWarningBanner() {
        const sessionKey = `zg-breach-dismissed-${window.location.hostname}`;
        if (sessionStorage.getItem(sessionKey)) {
            return; // Dismissed for this session
        }

        const warningEl = document.createElement('div');
        warningEl.className = 'zenithguard-breach-warning';
        warningEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.22 1.754a.75.75 0 011.56 0l4.25 8.5a.75.75 0 01-.655.996h-8.5a.75.75 0 01-.655-.996l4.25-8.5zM9 9a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 019 9zm0 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
            <span><strong>Security Alert:</strong> This site has a known history of data breaches. Be careful with your passwords and personal information.</span>
            <button class="z-dismiss-btn" title="Dismiss">&times;</button>
        `;

        const dismissBtn = warningEl.querySelector('.z-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                warningEl.remove();
                sessionStorage.setItem(sessionKey, 'true');
            });
        }

        document.body.prepend(warningEl);
    }

    private showToast(options: { message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number, id?: string | null }) {
        if ((window as any).ZenithGuardToastUtils && (window as any).ZenithGuardToastUtils.showToast) {
            (window as any).ZenithGuardToastUtils.showToast(options);
        } else {
            console.warn("ZenithGuard: Toast utility not found.");
        }
    }
}
