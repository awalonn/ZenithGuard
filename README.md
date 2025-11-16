# ZenithGuard - Advanced Ad & Privacy Blocker

ZenithGuard is a sophisticated, locally-run Google Chrome browser extension designed for advanced ad-blocking, privacy protection, and security. It leverages both traditional rule-based blocking and modern AI-powered analysis to provide a clean, fast, and safe browsing experience.

## Key Features

*   **Data Breach Warnings:** Get a clear, dismissible warning when you visit a site with a known history of major data breaches.
*   **Sandboxed iFrame Protection:** Automatically isolates all third-party iFrames, preventing them from running malicious scripts, launching pop-ups, or redirecting you.
*   **AI-Powered Cookie Consent:** Intelligently analyzes cookie banners and automatically clicks the most privacy-preserving option (e.g., "Reject All") for you.
*   **AI Anti-Adblock Wall Defeater:** A new, one-click tool that uses AI to analyze and remove overlays that demand you disable your ad blocker.
*   **Multi-Layered Ad Blocking:** Combines a static list of known ad-serving domains with a dynamic, AI-powered heuristic engine to block a wide range of ads and trackers.
*   **Dedicated YouTube™ Ad Blocking:** Specifically targets and blocks most pre-roll, mid-roll, and banner ads on YouTube for an uninterrupted viewing experience.
*   **Performance Hub:** A new **Performance Mode** intelligently disables non-critical cosmetic filters to prioritize page-load speed. The dashboard shows your estimated **Page Load Improvement** percentage.
*   **Unified Element Hiding Tools:** A powerful suite of tools to remove any unwanted page content, from a high-speed "Zapper" mode to a detailed Inspector and an AI-powered Hider.
*   **Filter List Subscriptions:** Subscribe to popular, community-maintained filter lists like EasyList to get thousands of automatically updated blocking rules.
*   **Security & Privacy Suite:** Includes Malware & Phishing Protection, URL Tracking Parameter Stripping, "Forgetful Browsing" mode for auto-cleanup, and Isolation Mode to block third-party scripts.
*   **AI Page Analyzer:** An on-demand tool that uses the Google Gemini API to scan a webpage, providing a detailed report on privacy threats, dark patterns, and visual annoyances, with an option to apply all suggested fixes at once.
*   **Proactive Privacy Insights:** Get real-time, contextual warnings in the popup about aggressive trackers, session replay scripts, and connections to data brokers on the page you are visiting.
*   **Comprehensive Rule Management:** A full settings page to manage all your custom rules, including a network blocklist, element hiding rules, heuristic keywords, and subscription lists.
*   **Live Activity Center & Network Logger:** The popup and a dedicated logger page provide a powerful, context-aware interface to manage rules, delete cookies, and view a live log of all network activity, now with Rule Provenance to show exactly *why* a request was blocked.
*   **Privacy Dashboard & Audit History:** Track your protection stats over time and review a detailed history of all your past AI page scans.

## Development Log
-   [x] **v2.13.0 - Proactive Security:** Introduced a new Data Breach Warning feature that alerts users when visiting sites with a known history of major data breaches.
-   [x] **v2.12.0 - The Refinement Update:** Implemented a memory leak fix, consolidated CSS animations for better performance, and performed a general code cleanup to improve stability.
-   [x] **v2.11.0 - Hardening & Intelligence:** Added automatic sandboxing for iFrames, an AI cookie consent manager, and an AI anti-adblock wall defeater.
-   [x] **v2.8.0 - AI Anti-Adblock:** Introduced a new AI-powered tool to defeat ad-block walls and redesigned the popup footer for better usability.
-   [x] **v2.7.0 - Performance Hub:** Added Performance Mode to prioritize speed and a Page Load Improvement metric to the dashboard.
-   [x] **v2.6.0 - User Guidance:** Added an "About" section and in-context descriptions for all General Settings toggles.
-   [x] **v2.5.0 - Element Zapper:** Introduced a new high-speed "Zapper" mode for instantly hiding multiple page elements.
-   [x] **v2.4.0 - Rule Provenance & Pause:** Upgraded the Network Logger to show the source of every block. Added a global "Pause Protection" button to the popup.
-   [x] **v2.3.0 - Unified Inspector:** Merged the Element Sieve and Inspector into a single, more powerful tool with a tiered context menu.
-   [x] **v2.0.0 - AI Quota Management:** Made privacy policy summaries on-demand and added a master toggle for AI Self-Healing to conserve API quota.
-   [x] **Initial Project Setup & Bug Fixes:** Core features, bug fixes, and major refactoring for stability and maintainability.