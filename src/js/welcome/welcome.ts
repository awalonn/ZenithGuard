import { closeCurrentTabOrWindow } from "../shared/browser";
import { notifyApiKeyUpdated } from "../shared/runtime_messages";
import { setLocal } from "../shared/storage_api";

type ToastType = "success" | "error" | "info";

function getToastContainer(): HTMLElement {
    let container = document.getElementById("zg-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "zg-toast-container";
        document.body.appendChild(container);
    }

    return container;
}

function showToast(message: string, type: ToastType): void {
    const container = getToastContainer();
    const toast = document.createElement("div");
    toast.className = `zg-toast zg-toast-${type}`;
    toast.textContent = `ZenithGuard: ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hiding");
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
    const saveButton = document.getElementById("save-start-btn") as HTMLButtonElement | null;
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement | null;
    const skipLink = document.getElementById("skip-link") as HTMLAnchorElement | null;

    if (!saveButton || !apiKeyInput || !skipLink) {
        console.error("ZenithGuard: Critical elements missing in welcome page.");
        return;
    }

    saveButton.addEventListener("click", async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showToast("Please enter an API key to enable AI features.", "error");
            return;
        }

        try {
            await setLocal({ geminiApiKey: apiKey });
            notifyApiKeyUpdated();
            showToast("Setup complete! You are ready to go.", "success");
            saveButton.textContent = "Saved";
            saveButton.disabled = true;
            setTimeout(() => {
                void closeCurrentTabOrWindow();
            }, 1500);
        } catch (error) {
            console.error("Error saving settings:", error);
            showToast("Failed to save settings.", "error");
        }
    });

    skipLink.addEventListener("click", (event) => {
        event.preventDefault();
        void closeCurrentTabOrWindow();
    });
});
