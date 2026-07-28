import { UiProtection } from "./UiProtection";

export type ToastType = "success" | "error" | "loading" | "info";

export type ToastOptions = {
    message: string;
    type?: ToastType;
    duration?: number;
    id?: string | null;
};

declare global {
    interface Window {
        ZenithGuardToastUtils?: {
            showToast: (options: ToastOptions) => void;
        };
        ZenithGuard_ProtectionEnabled?: boolean;
    }
}

function ensureContainer(): HTMLDivElement {
    let container = document.getElementById("zg-toast-container") as HTMLDivElement | null;
    if (!container) {
        container = document.createElement("div");
        container.id = "zg-toast-container";
        document.body.appendChild(container);
        UiProtection.getInstance().protect("zg-toast-container", () => {
            if (!document.getElementById("zg-toast-container")) {
                const restored = document.createElement("div");
                restored.id = "zg-toast-container";
                document.body.appendChild(restored);
            }
        });
    }
    return container;
}

function getIcon(type: ToastType): string {
    switch (type) {
        case "error":
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" /></svg>';
        case "loading":
            return '<div class="zg-toast-spinner"></div>';
        case "info":
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>';
        case "success":
        default:
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>';
    }
}

export function showToast(options: ToastOptions): void {
    const {
        message,
        type = "success",
        duration,
        id = null,
    } = options;
    const resolvedDuration = typeof duration === "number"
        ? duration
        : type === "loading"
            ? 0
            : type === "error"
                ? 7000
                : type === "info"
                    ? 6000
                    : 4500;

    const container = ensureContainer();
    if (id) {
        document.getElementById(id)?.remove();
    }

    const toast = document.createElement("div");
    if (id) {
        toast.id = id;
    }
    toast.className = `zg-toast zg-toast-${type}`;
    toast.innerHTML = getIcon(type);
    const messageElement = document.createElement("span");
    messageElement.textContent = `ZenithGuard: ${message}`;
    toast.appendChild(messageElement);
    container.appendChild(toast);

    if (resolvedDuration > 0) {
        window.setTimeout(() => {
            toast.classList.add("hiding");
            toast.addEventListener("animationend", () => toast.remove(), { once: true });
        }, resolvedDuration);
    }
}

export function installToastUtils(): void {
    window.ZenithGuardToastUtils = { showToast };
}
