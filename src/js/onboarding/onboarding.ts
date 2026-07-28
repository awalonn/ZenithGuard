import { closeCurrentTabOrWindow, openOptionsPage } from "../shared/browser";
import { notifyApiKeyUpdated } from "../shared/runtime_messages";
import { getSync, setLocal } from "../shared/storage_api";

document.addEventListener("DOMContentLoaded", async () => {
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement | null;
    const saveButton = document.getElementById("save-api-key-btn") as HTMLButtonElement | null;
    const skipButton = document.getElementById("skip-ai-setup-btn") as HTMLButtonElement | null;
    const initialSetup = document.getElementById("initial-setup");
    const successMessage = document.getElementById("success-message");
    const getStartedButton = document.getElementById("get-started-btn") as HTMLButtonElement | null;

    const { theme } = await getSync<{ theme?: string }>("theme");
    if (theme === "light") {
        document.body.classList.add("light-theme");
    }

    if (saveButton && apiKeyInput) {
        saveButton.addEventListener("click", async () => {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                alert("Please enter a valid API key.");
                return;
            }

            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
            await setLocal({ geminiApiKey: apiKey });
            notifyApiKeyUpdated();
            initialSetup?.classList.add("hidden");
            successMessage?.classList.remove("hidden");
        });
    }

    if (getStartedButton) {
        getStartedButton.addEventListener("click", async () => {
            await openOptionsPage();
            await closeCurrentTabOrWindow();
        });
    }

    if (skipButton) {
        skipButton.addEventListener("click", async () => {
            await openOptionsPage();
            await closeCurrentTabOrWindow();
        });
    }
});
