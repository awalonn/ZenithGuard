# ZenithGuard Privacy Policy

Last updated: July 28, 2026

ZenithGuard is a browser extension that blocks advertising and tracking requests, provides privacy and page-cleanup tools, and offers optional Google Gemini-assisted features.

## Data ZenithGuard handles

ZenithGuard processes the following data when necessary to provide its user-facing features:

- Website domains, URLs, request types, and request status information used by blocking, request logging, privacy insights, and diagnostics.
- Website content and element information used by cosmetic filtering, Inspector, Zapper, cookie handling, and page-analysis tools.
- Screenshots of the visible page, page text, selector context, and request URLs when a user actively invokes a relevant Gemini-assisted feature.
- Extension settings, site rules, local activity history, and temporary diagnostic information.
- A Google Gemini API key supplied voluntarily by the user.

ZenithGuard does not read or collect values entered into password fields.

## Local processing and storage

Core blocking, local classification, rule management, and most diagnostics run locally in the browser.

The Gemini API key is stored in Chrome extension local storage on the device. It is not stored in Chrome Sync and is excluded from ZenithGuard settings backups.

Network-log entries are held in extension memory, limited to 200 entries per tab, and removed when their tab state is discarded or the extension service worker restarts. Settings, user-created rules, and limited tool activity may persist in Chrome extension storage. Non-secret settings and rules may use Chrome Sync when that feature is enabled in Chrome.

Users can delete ZenithGuard's stored data by removing the extension. Individual rules and supported caches can also be removed through the extension settings.

## Data sent to third parties

When a user actively invokes a Gemini-assisted feature, ZenithGuard sends only the data needed for that requested action to the Google Gemini API. Depending on the feature, this can include a visible-page screenshot, URL, page title or text, DOM selector context, or request URLs. The user supplies the Gemini API key, and requests are transmitted directly from the extension to Google over HTTPS.

Google processes that information under the terms and privacy practices applicable to the user's Gemini API access. ZenithGuard does not operate an intermediary server for Gemini requests.

ZenithGuard downloads a public malware-domain list over HTTPS. That request retrieves list data and does not intentionally include the user's browsing history or page content.

## Sharing, sale, and advertising

ZenithGuard does not sell user data, use it for personalized advertising, or transfer it to data brokers. Data is transferred to Google Gemini only when necessary to perform a Gemini feature actively requested by the user.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Permissions

ZenithGuard requests browser permissions needed for blocking requests, observing request status, applying page tools, managing tabs and navigation, storing settings, scheduling list updates, and providing context-menu actions. Access to browsing data is optional and requested only when the user enables Forgetful Browsing, which clears supported site data after the last matching tab is closed.

## Changes

This policy will be updated when ZenithGuard's data practices change. Material changes will also be disclosed in the extension interface where required.

## Contact

Privacy questions and requests can be submitted through the [ZenithGuard GitHub repository](https://github.com/awalonn/ZenithGuard/issues).
