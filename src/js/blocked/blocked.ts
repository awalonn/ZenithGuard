import { getNetworkLog, sendMessage } from "../shared/runtime_messages";
import type { NetworkLogEntryResponse } from "../shared/runtime_messages";

const mode = document.body.dataset.mode === "focus" ? "focus" : "threat";

const titleElement = document.getElementById("blocked-title");
const copyElement = document.getElementById("blocked-copy");
const iconElement = document.getElementById("blocked-icon");
const noteElement = document.getElementById("blocked-note");
const backButton = document.getElementById("blocked-back-btn");
const visitButton = document.getElementById("blocked-visit-btn") as HTMLButtonElement | null;
const settingsButton = document.getElementById("blocked-settings-btn");

export type BlockedNetworkLogEntry = NetworkLogEntryResponse;

export type BlockedNetworkLogSnapshot = {
    entries?: BlockedNetworkLogEntry[];
};

export type VisitAnywayTarget = {
    url: string;
    hostname: string;
};

const icons = {
    focus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V13L16.2,16.1L17,14.9L12.5,12.2V7H11Z" /></svg>',
    threat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" /></svg>',
} as const;

const content = {
    focus: {
        title: "Focus Mode Active",
        copy: "This site is on your Focus Blocklist. Stop scrolling and get back to work!",
    },
    threat: {
        title: "Dangerous Page Blocked",
        copy: "ZenithGuard blocked access to this page to protect you from potential security threats. The site is known for malware, phishing, or other malicious content.",
        note: "If you intentionally trust this site, you can add it to Protection Paused on Sites in Settings -> My Rules.",
        showSettingsAction: true,
    },
} as const;

const pageContent = content[mode];

function getHostnameFromUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
            ? url.hostname
            : null;
    } catch {
        return null;
    }
}

export function getVisitAnywayTarget(snapshot: BlockedNetworkLogSnapshot): VisitAnywayTarget | null {
    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    const sorted = [...entries].sort((left, right) => {
        const leftTimestamp = typeof left.timestamp === "number" ? left.timestamp : 0;
        const rightTimestamp = typeof right.timestamp === "number" ? right.timestamp : 0;
        return rightTimestamp - leftTimestamp;
    });

    for (const entry of sorted) {
        if (entry.status !== "blocked" || entry.type !== "main_frame" || typeof entry.url !== "string") {
            continue;
        }

        const hostname = getHostnameFromUrl(entry.url);
        if (hostname) {
            return {
                url: entry.url,
                hostname,
            };
        }
    }

    return null;
}

async function getCurrentBlockedTabId(): Promise<number | null> {
    try {
        const tab = await chrome.tabs.getCurrent();
        return typeof tab?.id === "number" ? tab.id : null;
    } catch {
        return null;
    }
}

async function loadVisitAnywayTarget(): Promise<VisitAnywayTarget | null> {
    const tabId = await getCurrentBlockedTabId();
    if (typeof tabId !== "number") {
        return null;
    }

    try {
        const snapshot = await getNetworkLog(tabId);
        return getVisitAnywayTarget(snapshot);
    } catch {
        return null;
    }
}

function setBlockedNote(message: string): void {
    if (!noteElement) {
        return;
    }

    noteElement.textContent = message;
    noteElement.hidden = false;
}

if (titleElement) {
    titleElement.textContent = pageContent.title;
}

if (copyElement) {
    copyElement.textContent = pageContent.copy;
}

if (noteElement) {
    if ("note" in pageContent && pageContent.note) {
        noteElement.textContent = pageContent.note;
        noteElement.hidden = false;
    } else {
        noteElement.hidden = true;
    }
}

if (iconElement) {
    iconElement.classList.add(mode);
    iconElement.innerHTML = icons[mode];
}

if (backButton) {
    backButton.addEventListener("click", () => {
        if (window.history.length > 2) {
            window.history.back();
            return;
        }

        window.close();
    });
}

if (visitButton) {
    if (mode === "threat") {
        void loadVisitAnywayTarget().then((target) => {
            if (!target) {
                return;
            }

            setBlockedNote(`If you intentionally trust ${target.hostname}, Visit Anyway will temporarily allow this site for the current browser session.`);
            visitButton.hidden = false;
            visitButton.addEventListener("click", async () => {
                const originalLabel = visitButton.textContent || "Visit Anyway";
                visitButton.disabled = true;
                visitButton.textContent = "Allowing...";

                try {
                    await sendMessage({
                        type: "TEMPORARILY_ALLOW_DOMAIN",
                        domain: target.hostname,
                    });
                    window.location.assign(target.url);
                } catch (error) {
                    visitButton.disabled = false;
                    visitButton.textContent = originalLabel;
                    const message = error instanceof Error ? error.message : String(error);
                    setBlockedNote(`Could not allow this site right now. ${message}`);
                }
            });
        });
    } else {
        visitButton.hidden = true;
    }
}

if (settingsButton) {
    if ("showSettingsAction" in pageContent && pageContent.showSettingsAction) {
        settingsButton.hidden = false;
        settingsButton.addEventListener("click", async () => {
            await chrome.runtime.openOptionsPage();
        });
    } else {
        settingsButton.hidden = true;
    }
}
