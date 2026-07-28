import { notifyPrivacyPolicyFound } from "./shared/runtime_messages";

(async () => {
    const keywords = ["privacy policy", "privacy", "data policy"];
    const links = Array.from(document.getElementsByTagName("a"));
    let candidate: HTMLAnchorElement | null = null;

    for (const link of links) {
        const text = link.textContent?.trim().toLowerCase() || "";
        if (keywords.some((keyword) => text.includes(keyword)) && link.href) {
            candidate = link;
            break;
        }
    }

    if (!candidate) {
        return;
    }

    try {
        const policyUrl = new URL(candidate.href, window.location.href).href;
        notifyPrivacyPolicyFound(window.location.hostname, policyUrl);
    } catch (error) {
        console.error("ZenithGuard Policy Finder: Error processing link.", error);
    }
})();
