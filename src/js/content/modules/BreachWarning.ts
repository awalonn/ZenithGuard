import type { ToastOptions } from "./toast";
import { UiProtection } from "./UiProtection";
import { getLocal, setLocal } from "../../shared/storage_api";

type ToolActivityLogEntry = {
    tool: string;
    title: string;
    message: string;
    tone: "info" | "success" | "error";
    timestamp: number;
    domain?: string;
};

export function getBreachDismissedKey(hostname: string): string {
    const normalizedHostname = String(hostname || "").trim().toLowerCase();
    const scopeHostname = normalizedHostname.startsWith("www.")
        ? normalizedHostname.slice(4)
        : normalizedHostname;
    return `zg-breach-dismissed-${scopeHostname}`;
}

export class BreachWarning {
    private isBreachedSite = false;
    private isPasswordMonitorAttached = false;
    private hasRecordedBannerActivity = false;
    private readonly uiProtection = UiProtection.getInstance();

    constructor(private readonly showToast: (options: ToastOptions) => void) {}

    setBreached(breached: boolean): void {
        this.isBreachedSite = breached;
        if (!breached) {
            this.removeBreachWarningBanner();
            return;
        }

        this.attachPasswordMonitor();
        this.showBreachWarningBanner();
    }

    private attachPasswordMonitor(): void {
        if (this.isPasswordMonitorAttached) {
            return;
        }

        this.isPasswordMonitorAttached = true;
        document.addEventListener("focusin", (event) => {
            const target = event.target as HTMLInputElement | null;
            if (target?.tagName === "INPUT" && target.type === "password" && this.isBreachedSite) {
                this.showToast({
                    message: "Warning: This site has a known data breach. Do not re-use an old password!",
                    type: "error",
                    duration: 6000,
                });
            }
        });
    }

    private showBreachWarningBanner(): void {
        const dismissedKey = getBreachDismissedKey(window.location.hostname);
        if (sessionStorage.getItem(dismissedKey)) {
            return;
        }

        const existing = document.querySelector(".zenithguard-breach-warning") as HTMLDivElement | null;
        if (existing) {
            return;
        }

        const banner = document.createElement("div");
        banner.id = "zg-breach-warning-banner";
        banner.className = "zenithguard-breach-warning";
        banner.setAttribute("role", "alert");
        banner.setAttribute("aria-live", "polite");

        const icon = document.createElement("span");
        icon.className = "zg-breach-warning-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "!";

        const message = document.createElement("span");
        message.className = "zg-breach-warning-message";
        const title = document.createElement("strong");
        title.textContent = "Data breach notice:";
        message.append(title, " This site has a known breach history. Be careful with reused passwords and personal information.");

        const dismissButton = document.createElement("button");
        dismissButton.type = "button";
        dismissButton.className = "z-dismiss-btn";
        dismissButton.textContent = "Dismiss for this tab";

        dismissButton.addEventListener("click", () => {
            this.uiProtection.unprotect("zg-breach-warning-banner");
            banner.remove();
            sessionStorage.setItem(dismissedKey, "true");
        });
        banner.append(icon, message, dismissButton);

        document.body.prepend(banner);
        this.recordBannerActivity();
        this.uiProtection.protect("zg-breach-warning-banner", () => {
            if (!this.isBreachedSite || sessionStorage.getItem(dismissedKey) || document.getElementById("zg-breach-warning-banner")) {
                return;
            }

            this.showBreachWarningBanner();
        });
    }

    private removeBreachWarningBanner(): void {
        this.uiProtection.unprotect("zg-breach-warning-banner");
        document.getElementById("zg-breach-warning-banner")?.remove();
    }

    private recordBannerActivity(): void {
        if (this.hasRecordedBannerActivity) {
            return;
        }

        this.hasRecordedBannerActivity = true;
        const hostname = window.location.hostname;
        void this.appendToolActivity({
            tool: "Data Breach Warning",
            title: "Breach Warning Shown",
            message: "Displayed a breach-history warning banner for this site.",
            tone: "info",
            timestamp: Date.now(),
            domain: hostname,
        }).catch((error) => {
            console.warn("ZenithGuard: Failed to record breach warning activity.", error);
        });
    }

    private async appendToolActivity(entry: ToolActivityLogEntry): Promise<void> {
        const snapshot = await getLocal<{ toolActivityLog?: ToolActivityLogEntry[] }>("toolActivityLog");
        const current = snapshot && Array.isArray(snapshot.toolActivityLog) ? snapshot.toolActivityLog : [];

        await setLocal({
            toolActivityLog: [entry, ...current].slice(0, 25),
        });
    }
}
