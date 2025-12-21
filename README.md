ZenithGuard - Advanced AI Ad & Privacy Blocker
[https://github.com/awalonn/ZenithGuard](https://github.com/awalonn/ZenithGuard)

ZenithGuard is a next-generation ad and privacy blocker for Google Chrome, built on Manifest V3. It
combines the power of traditional, community-driven filter lists with a suite of intelligent, AI-powered
tools to create a cleaner, safer, and faster browsing experience.

It operates on a powerful hybrid blocking engine:
1. Static Engine: Uses massive, pre-compiled filter lists (like EasyList & EasyPrivacy) that are
bundled with the extension. This provides a robust, high-performance baseline that blocks tens of
thousands of common ads and trackers without slowing down your browser.
2. Dynamic Engine: Uses a flexible set of rules that are updated automatically in the background.
This engine targets fast-changing threats like malware and YouTube ads, ensuring the extension
stays effective between major updates.
Key Features
Advanced AI-Powered Tools
ZenithGuard uses the Google Gemini API to go beyond simple rule-based blocking, giving you
intelligent tools to defeat modern web annoyances.
AI Page Analyzer: An on-demand tool that scans any webpage. It provides a detailed report on
privacy threats, deceptive "dark patterns" in the UI, and visual annoyances. It then gives you oneclick suggestions to fix them.
AI Anti-Adblock Wall Defeater: Tired of sites demanding you disable your ad blocker? The
"Defeat Wall" tool in the popup uses AI to analyze and remove these overlays, giving you back
control.
AI Cookie Consent: Intelligently analyzes cookie consent banners and automatically clicks the
most privacy-preserving option (e.g., "Reject All") for you.
AI Self-Healing Rules: Automatically detects when your custom hiding rules break due to a site
update and uses AI to try and repair them.
AI Element Hider: Can't write a CSS selector? Just describe the element you want to hide (e.g.,
"the floating video player in the corner") and the AI will generate the rule for you.
Comprehensive Privacy & Security
Hybrid Ad & Tracker Blocking: Combines static and dynamic engines to block ads, trackers,
analytics scripts, and more.
Data Breach Warnings: Shows a clear, non-intrusive warning when you visit a site with a known
history of major data breaches.
11/20/25, 6:35 AM Google Gemini
https://gemini.google.com/app/e9c7c31e15e1ad12 1/3
Malware & Phishing Protection: Dynamically updates a list of known malicious domains to block
you from accessing them.
iFrame Sandboxing: Automatically isolates third-party iFrames, preventing them from running
malicious scripts, launching pop-ups, or redirecting you.
Dedicated YouTube Ad Blocking: Uses a dynamically updated list to block pre-roll, mid-roll, and
banner ads on YouTube.
URL Tracking Stripper: Automatically removes tracking parameters (like utm_source , fbclid )
from URLs.
Powerful User Tools
Element Hiding Suite:
Zapper: An instant-hide mode. Just click any element on a page to make it disappear.
Includes "Undo" functionality for accidental clicks.
Inspector: A developer-grade tool that lets you select any element, see its associated
network requests, and create cosmetic or network rules with a single click.
Privacy Insights: The popup provides real-time, contextual warnings about aggressive trackers,
session replay scripts, and data brokers found on the current page.
Live Network Logger: A dedicated logger page that shows all network activity for a tab. It
features "Rule Provenance," showing you exactly which filter list (e.g., "Static Filter List," "Malware
Protection") was responsible for blocking a request.
Full Settings Management: A complete dashboard to track your stats, manage all your custom
rules, and toggle bundled filter lists.
Data Management: Export all your custom settings to a JSON file and import them on another
device.

Focus Mode
Need to get work done? Focus Mode temporarily blocks distracting sites (like YouTube, Reddit, Twitter) for 25 minutes.
- **One-Click Activation**: Toggle it directly from the popup tools menu.
- **Custom Blocklist**: Add or remove sites from your "Focus Blocklist" in the Settings page.
- **Motivational Block Screen**: If you try to visit a blocked site, you'll see a clean, distraction-free page with a motivational quote.
- **Timer**: A countdown timer in the popup shows you how much focus time is left.

Advanced Privacy Insights & Dashboard
ZenithGuard now visualizes your privacy in real-time.
- **Privacy Grade**: Every site you visit gets a grade (A-F) based on the number and severity of trackers blocked.
- **Privacy Dashboard**: A dedicated tab in Settings showing your 30-day history of blocks, complete with interactive charts and KPI cards for "Data Saved" and "Total Threats Blocked".
- **Contextual Insights**: The popup shows exactly *why* a site got a bad grade (e.g., "Session Replay Script Detected", "Canvas Fingerprinting").

How to Build (For Developers)
This extension uses a hybrid architecture and requires a one-time build step to populate the static
filter lists.
1. Prerequisites
Node.js (v16 or higher)
NPM (comes with Node.js)
2. Setup
1. Install Dependencies: This script uses node-fetch to download the lists.
npm install
11/20/25, 6:35 AM Google Gemini
https://gemini.google.com/app/e9c7c31e15e1ad12 2/3
2. Run the Build Script: This will download the latest rules from EasyList, EasyPrivacy, etc., convert
them to the required JSON formats, and save them in the rules/ directory.
node build_rules.js
(See AD_BLOCKER_ARCHITECTURE.md for a full explanation of why this is necessary).
3. Load the Extension
1. Open Google Chrome and navigate to chrome://extensions/ .
2. Turn on "Developer mode" in the top-right corner.
3. Click "Load unpacked".
4. Select the root ZenithGuard folder (the one containing manifest.json ).
4. Deployment & Release
This project uses GitHub Actions for automated releases.
1.  **Bump Version**: Update `version` in `manifest.json`.
2.  **Tag Release**:
    ```bash
    git tag v1.0.0
    git push origin v1.0.0
    ```
3.  **Automatic Build**: The GitHub Action will build the extension, zip it, and create a Draft Release with the artifact.

5. Final Configuration

To enable all features, you must:
1. Set Your API Key:
Go to the ZenithGuard Settings > General Settings page.
Paste your Google Gemini API key (from Google AI Studio) into the API key field.

2. Set Your YouTube Rules URL:
Upload the rules/youtube_rules.json file to a public URL (like a GitHub Gist).
Open js/background/modules/youtube_rules_updater.js .
Paste your "Raw" Gist URL into the YOUTUBE_RULES_REMOTE_URL constant.

3. Set Your Tracker List URL:
Upload the rules/trackers.json file to a public URL (like a GitHub Gist).
Open js/background/modules/tracker_list_updater.js .
Paste your "Raw" Gist URL into the TRACKER_LIST_REMOTE_URL constant.