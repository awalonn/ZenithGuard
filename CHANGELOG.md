# Changelog

All notable changes to ZenithGuard will be documented in this file.

## [2.1.0] - 2025-12-21

### Added
- **Dashboard UI Overhaul**: Completely redesigned the Filter Lists section to clearly separate "Network Blocking" (static, built-in) and "Cosmetic Filters" (dynamic, live updates).
- **Manual Network Blocklist**: Added a new specific "Add Site" form to manually block domains in the Network Blocklist.
- **Improved Heuristic Engine**: Added 9 new "Pro" level keywords (`telemetry`, `fingerprint`, `popunder`, etc.) effectively catching modern tracking techniques.
- **Smart Keyword Sync**: Implemented automatic migration to sync new heuristic keywords to existing user profiles without overwriting custom settings.
- **Cosmetic Rule Stats**: Added real-time counters displaying the number of active cosmetic rules for each bundled list.

### Fixed
- **YouTube Auto-Skip**: Fixed a critical bug where `yt_interceptor.js` was failing to inject due to an incorrect build path. Auto-skip and ad-fast-forwarding are now fully functional.
- **Update Button State**: Fixed an issue where the "Update Cosmetic Filters" button would get stuck in the "Updating..." state.
- **Filter Architecture Clarity**: Added explanatory badges and warning boxes to clarify the hybrid filter system (Static Network + Dynamic Cosmetic).

## [2.0.0] - 2025-12-20
- **Major Release**: Initial migration to pure Chrome DNR (Declarative Net Request) rulesets for performance.

## [1.1.8] - 2025-12-20

### Added
- **Gemini 3 Flash Preview Integration**: Upgraded the core AI engine to Gemini 3.0 for 2x faster visual reasoning and more robust selector generation.
- **Persistent "Defeat Wall" Fixes**: Identified adblock walls are now saved to local storage and automatically applied upon page refresh.
- **Global AI Rate Limiting**: Implemented a 15-second global throttle between AI requests to strictly adhere to Gemini Free Tier quotas.
- **Per-Domain AI Cooldown**: Automatic AI tasks (like cookie banner detection) now feature a 24-hour per-domain cooldown to prevent quota exhaustion during browsing sessions.
- **Trace Logging**: Added granular logging for rule application and AI status to aid in troubleshooting.

### Fixed
- **Rule Budget Crash**: Optimized the filtering engine to bundle simple domain rules, saving over 51,000 rule slots and eliminating the "budget reached" error.
- **Non-ASCII Rule Error**: Added a safety filter to skip rules containing non-ASCII characters, preventing the `declarativeNetRequest` engine from failing.
- **Selector Stability**: Refined AI prompts to prioritize stable wildcard selectors (e.g., `div[id^="admiral-"]`) over random/dynamic IDs.

### Changed
- **Default AI Behavior**: Automatic AI Cookie Banner detection and Self-Healing are now disabled by default for current users to prioritize manual "Defeat Wall" actions.
- **Model Transition**: Moved away from Gemini 2.5/2.0 prototypes to the stable Gemini 3 infrastructure.

## [1.1.1]

### Added
- **Architectural Refactor**: Split core content script into modular components (`YouTubeProtector`, `SecurityGuard`, etc.).
- **Stability Improvements**: Improved general extension performance and reduced background overhead.

## [1.1.0]

### Added
- **Hybrid Engine**: Combined static network rules with dynamic cosmetic rules for better ad coverage.
- **YouTube "Nuclear" Protection**: Enhanced ad-skipping logic for YouTube.
- **Isolation Mode**: Restored the ability to block all third-party requests on a per-site basis.
