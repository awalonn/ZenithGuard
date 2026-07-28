# Next Session Plan

Workspace: `G:\AI Projects\Browser\zenithguard`

## Fresh Chat Handoff
- Start here in a new chat. Do not redo old work; continue from this file and the recommended next task.
- Current baseline after the latest session:
  - Version is now `3.2.2`.
  - `npm run test:smoke` passes.
  - `npm run build` passes.
  - `npx svelte-check` passes.
  - `npm run check:dist` passes against rebuilt `dist`.
  - Latest smoke result: 58 unit suites / 377 unit tests and 4 e2e suites / 5 e2e tests passed.
  - Web Store packaging is not the active priority. Do not rebuild release zips unless the user explicitly asks for a publish/upload artifact.
  - Latest packaged e2e-only result after adding the Logger-to-Settings workflow test: 4 e2e suites / 5 e2e tests passed.
  - Latest focused consolidation checks after the smoke run: Network blocklist metadata plus settings/logger/analyzer/rules focused unit tests passed with 28 tests, `npx svelte-check` passed, `npm run build` passed, and full `npm run test:smoke` passed.
- Latest Analyzer follow-up: adding a finding now distinguishes a fresh custom-rule add from a background `Rule already exists.` response. Existing rules show as `Custom blocklist` with an inline info note instead of being relabeled `Added from Analyzer`. Focused Analyzer unit tests, `npx svelte-check`, and `npm run build` passed.
- Latest Analyzer/My Rules consistency fix: removing a covered Analyzer finding now deletes only the exact stored custom rule, with `www`/apex treated as the intended equivalent. It no longer deletes separate parent, child, or sibling hostname rules, and it safely preserves legacy string-format rules. Seventeen focused Analyzer tests, `npx svelte-check`, `npm run build`, and full smoke passed.
- Latest focused UX audit fix: Analyzer and Logger `Manage in My Rules` actions now use an explicit Network Blocklist deep link. Settings opens My Rules, pre-filters the custom Network Blocklist to the selected domain, and scrolls that table into view instead of leaving the user at the top of the long rules page. Unit handoff/URL coverage and the packaged Logger-to-Settings workflow verify the behavior; `npx svelte-check`, `npm run build`, and full smoke passed.
- Latest site-specific fix: `NextGenCleaner` now reads element IDs and classes through DOM attributes, preventing `id?.startsWith is not a function` crashes on pages with non-string reflected DOM properties such as SVG values. The same hardening pass now cleans matching widgets already present at startup, nested inside newly inserted wrappers, or marked by later ID/class mutations, while correctly excluding `zg-*` extension UI. Five focused tests, `npx svelte-check`, and `npm run build` passed.
- Build command is exactly `npm run build`; it runs `vite build && node scripts/build_auxiliary_entries.mjs dist`.
- Full regression command is exactly `npm run test:smoke`; it runs extension surface checks, DNR checks, unit tests, and packaged e2e tests. Use it at meaningful checkpoints, before handoff/release, or after broad cross-surface changes rather than after every small edit.
- Typed UI/source check command is exactly `npx svelte-check`. Use it when Svelte or typed UI/source paths change.
- For narrow changes, prefer the focused unit/e2e test that covers the edited path, then run broader checks only when the risk or touched surface justifies it.
- Packaged extension e2e tests use Puppeteer from the repo dependency, load `dist` as an unpacked Chromium extension, and run through Jest with `jest.e2e.config.js`.
- Focused packaged e2e command pattern:
  - `node --max-old-space-size=8192 --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.e2e.config.js tests/e2e/<test-file>.test.ts --runInBand`
- Focused unit command pattern:
  - `npm test -- --runTestsByPath tests/unit/<test-file>.test.ts`
- Use PowerShell in this workspace. Prefer `rg` for search when available; otherwise use `Select-String`.
- Use `apply_patch` for manual file edits.
- This workspace currently is not seen as a git repository by shell commands, so `git status` returns `fatal: not a git repository`.
- Do not return to broad live-site coverage unless the user reports a specific page. For future site issues, first use Logger `Review`, `Copy Review List`, or popup `Tools -> Report This Site -> Copy Site Report`.
- The last completed product improvement clarified Analyzer add-to-blocklist state when a rule already exists, without forcing a rescan or overwriting original rule provenance.
- Good next coding direction: continue focused product improvements outside broad site chasing, likely another Analyzer/Logger/My Rules consistency pass, or expand site-specific cleanup only when there is a concrete reported page or copied Logger/site report.

## Current State
- The repo is past recovery mode.
- ZenithGuard is now versioned as `3.2.2` in `package.json`, `package-lock.json`, `manifest.json`, the Gemini client header, and the What&apos;s New fallback/release copy.
- `npm run test:smoke` passes.
- `npm run build` passes.
- No current Chrome Web Store upload artifact is needed unless the user explicitly asks to publish/package one.
- `dist` loads in Chrome as an unpacked extension.
- Popup, Settings, Analyzer, and Logger are rebuilt and usable.
- `Settings -> General Settings` now has a visible `Global Protection` master switch.
- Settings export/import is now a real backup loop for important persisted state.
- `Settings -> Dashboard` now includes an `Extension Health` runtime card for quick packaged-extension diagnostics.
- Data Breach Warnings now show a clearer accessible banner with "Dismiss for this tab", remove stale banners when the current page is no longer marked breached, and have focused unit coverage for banner rendering, dismissal, stale-removal, and password reminder behavior.
- Data Breach Warnings now record a `Data Breach Warning` tool activity entry when the banner is actually shown, so Popup Tools/history and copied site reports can show that ZenithGuard displayed the warning.
- Popup `Report This Site` now includes `Data breach warnings: on/off` in the protection state so reports explain whether the top breach-warning banner feature is enabled.
- Logger now has a first-class `Review` filter for allowed, uncovered third-party requests that are candidates for manual rule review.
- The Logger `Review` filter shows a live badge count for those reviewable requests.
- Logger can copy a plain-text review list for those requests, including candidate domain, type, initiator, reason, and URL.
- Content cosmetic cleanup now avoids full-page rescans for unrelated DOM mutations, reducing overhead on mutation-heavy apps such as Reddit video threads.
- Content cosmetic cleanup now hides clearly labeled sponsored results on Google Search in known ad result regions, including late-injected ad cards, while avoiding organic results that only mention sponsored content.
- Reddit pages now get a narrow media performance guard that pauses offscreen video/GIF-style clips and resumes only guard-paused videos near the viewport.
- AI Page Analyzer now keeps completed reports visible when custom rules change, so adding a finding to the custom blocklist no longer forces a paid rescan for the same page.
- Popup Guard now has an isolated-world logger plus a MAIN-world all-frames blocker, so third-party player frames can be stopped. It blocks forced `window.open()` abuse without a trusted gesture, cross-site/blank popups after non-link clicks, and suspicious cross-site overlay anchors while allowing same-site and explicit link popups.
- Popup Guard packaged verification passed against a local fake third-party player frame: MAIN-world injection was present in the iframe, forced cross-site `window.open()` was blocked, same-site and explicit link popups were allowed, suspicious player anchors were blocked, and the block was recorded in activity history.
- Added targeted first-party Grok privacy rules for observed telemetry/monitoring paths while intentionally leaving broad Stripe script rules out of the default set to avoid breaking legitimate payment flows.
- Live-verified Grok with the packaged extension: logged-out Grok rendered normally, `core_protection` was enabled, each targeted Grok telemetry path produced DNR blocks, and no watched Grok telemetry request succeeded.
- Popup Tools now includes `Report This Site`, which copies a manual report package with current URL, policy state, request counts, reviewable allowed third-party ad-tech misses, recent tool activity, recent network decisions, and matched rule details for user-reported site issues.
- The popup report flow is now covered by a packaged `dist` e2e test that loads the extension, keeps a web tab active, opens the popup page against that tab context, copies the report, and verifies `Site Report` activity is recorded.
- After copying a site report, the success card and saved tool-activity entry now offer an `Open Logger Review` follow-up that opens Logger for the captured tab with `status=allowed` and `review=needs-review`.
- Settings diagnostics now include a redacted network-log summary for the diagnostics web tab: total, blocked, allowed, modified, session start, and last update timestamps. The diagnostics preview shows those counts without including request URLs.
- Settings diagnostics now include a redacted Dashboard summary in the copied/downloaded JSON and preview: tool activity today, custom network rules, and enabled core rules. Diagnostics schema version is now `2`.
- Popup report flow now keeps tab-hosted popup pages from replacing the intended web-tab context. If the active tab is an extension page, the popup loader falls back to the most recent current-window web tab before building reports or reading network state.
- Popup `Tools -> Report This Site` now exposes `Open Logger Review` before copying a report, using the same `status=allowed&review=needs-review` Logger route as the post-copy follow-up.
- The popup Manual Report card now shows a review-candidate count using the same allowed third-party ad-tech/video-ad signal logic as the copied site report.
- The popup Manual Report card now previews up to three review-candidate domains with type and reason, without exposing full request URLs.
- DNR smoke validation now rejects broad compatibility-sensitive payment/checkout filters such as Stripe, PayPal, Checkout.com, Adyen, and Braintree if they appear in either defaults or packaged core rules.
- DNR smoke validation also rejects broad TikTok-family compatibility filters such as `||tiktok.com^`, TikTok CDN/media hosts, and login/security SDK hosts. Existing narrow TikTok telemetry filters remain allowed.
- Packaged popup e2e now verifies the direct pre-copy `Open Logger Review` action opens Logger for the active web tab with `status=allowed` and `review=needs-review`.
- Packaged popup e2e now also verifies the post-copy success-card `Open Logger Review` follow-up opens Logger for the original web tab with `status=allowed` and `review=needs-review`.
- Popup `Tools -> Report This Site` now includes `Copy Review List`, which copies only redacted review-candidate domains, suggested domain filters, request types, and reasons without request paths or query strings.
- Packaged popup e2e now verifies `Copy Review List` is present and disabled when the active tab has no review candidates.
- What&apos;s New now describes the current release as the Reporting and Compatibility release, highlighting manual reports, Logger Review, redacted review lists, diagnostics, compatibility guards, and Google Search sponsored-result cleanup.
- Logger and popup review-list copy actions now share the same redacted formatter in `src/ui/shared/review_candidates.ts`, so both outputs use the same candidate/domain/type/reason structure and avoid leaking request paths or query strings.
- Logger review rows now include a `Copy domain filter` action that copies the redacted ABP-style candidate such as `||example.com^` without copying the full request URL.
- Logger `Copy domain filter` copied-state labels are now tied to the copied row ID, so rows sharing a domain do not all show `Copied filter`.
- Logger now has a bulk `Copy All Filters` action for the currently visible reviewable rows. It copies deduped ABP-style domain filters only, without request paths or query strings.
- Logger bulk filter copy labels now show the visible unique filter count, such as `Copy 3 Filters` or `Copied 3 Filters`.
- Logger now has a bulk `Add X Filters` action for the currently visible reviewable rows. It dedupes candidates, writes custom network blocklist entries with Logger metadata, and applies rules once.
- Logger bulk add now requires a confirmation click: first click shows `Confirm Add X Filters`, the second click writes rules. The confirmation resets if the visible filter count changes or after a short timeout.
- Logger bulk add now shows a success status with `Undo last add`. Undo removes only filters newly created by the last bulk add, leaves pre-existing rules alone, cleans Logger metadata, and applies rules once.
- Settings `My Rules -> Network Blocklist` now has an origin filter for custom rules, including `Added from Logger`, so bulk-added Logger rules are easy to audit later. Metadata lookup now handles `www`/apex hostname variants.
- Packaged e2e now covers the Logger Review -> bulk add -> Settings origin filter -> undo path using the built `dist` extension.
- Logger bulk add now preserves existing origin metadata when it re-enables a disabled custom network rule. Only newly created rules receive Logger metadata and become eligible for the last-add undo list.
- Logger now shows a scope hint for review/bulk actions, clarifying that `Copy Review List` covers all review candidates while `Copy X Filters` and `Add X Filters` act on the currently visible filtered rows.
- Logger bulk-add status messages now distinguish `Added X new filters` from `re-enabled X existing filters`; mixed operations report both, while undo still targets only newly created filters.
- Logger bulk-add completion labels now use `Updated X Filters` instead of `Added X Filters`, avoiding misleading copy when the action only re-enabled existing disabled rules.
- Packaged Logger-to-Settings e2e now expects the revised bulk-add status copy `Added 1 new filter.`.
- The old recovery-named surface check was renamed to `scripts/check_extension_surface.mjs`; `npm run check:surface` now uses that script and reports "ZenithGuard extension surface looks aligned."
- Stale `recovery-*` UI shell class names were replaced with `zg-*` class names. Remaining recovery terms in source/tests refer to the actual Wall Recovery feature.
- Release packaging now ignores Chrome-generated reserved `_metadata` folders.
- Root recovery documents `RECOVERY_INVENTORY.md` and `RECOVERY_STATUS.md` were removed. `README.md` now describes the current `3.2.2` project state instead of the old recovery workspace, and test manifest-version fixtures now use `3.2.2`.
- Loading `dist` in Chrome or packaged e2e may recreate `dist/_metadata`. `npm run check:dist` now tolerates it with a warning, and `release.js` excludes it from future zips.
- Stale recovered root build artifacts were removed: root `assets/`, root `js/`, and root `_metadata`. Keep active source/static inputs such as `src/`, `css/`, `icons/`, `rules/`, `_locales/`, and `manifest.json`.
- `npm run check:surface` now fails if stale root build artifacts `assets/`, `js/`, or `_metadata` reappear. `dist/assets`, `dist/js`, and Chrome-generated `dist/_metadata` remain valid.
- `README.md` now documents that Chrome may create `dist/_metadata`, and that root `assets/`, `js/`, and `_metadata` are stale artifacts guarded by `npm run check:surface`.
- Settings backup import now accepts legacy custom network blocklist and heuristic keyword arrays saved as plain strings, as well as current `{ value, enabled }` rule objects. This prevents older backups from silently losing those rules during import.
- Settings backup import now previews normalized import counts before replacing profile state. After choosing a backup file, the UI shows counts for custom network rules, heuristic keywords, custom hiding rules, wall fixes, paused sites, and rule metadata records, then requires `Confirm Import` or `Cancel`.
- The malware/security blocked page now offers `Visit Anyway` when it can recover the original blocked main-frame URL from the current tab network log. The button temporarily allows the blocked hostname for the current browser session via `TEMPORARILY_ALLOW_DOMAIN`, then navigates to the original URL. It does not permanently add the site to Settings paused sites.
- Remote text cache refresh failures such as malware feed HTTP 407 proxy-auth responses now log a warning that cached or bundled data is being used, instead of a scary background `console.error`. The bundled malware seed and any existing cache remain the fallback.
- Optional Privacy Insights AI failures now log as warnings instead of background errors. Gemini network-summary and Local AI tracker-insight failures simply omit the optional AI insight while the normal tracker/blocking insights continue.
- Zapper activation from both the popup and keyboard shortcut now targets only the top frame with `frameId: 0`. This prevents duplicate Zapper HUDs from appearing inside page iframes while the main-page toolbar is active.
- Zapper runtime now also cleans stale `zg-zapper-banner` and `zg-zapper-highlight` nodes before mounting and on stop, unregistering UI protection before removal. It treats any Zapper UI element by ID as non-zappable, so old toolbar fragments cannot be highlighted or saved as hiding rules.
- Inspector activation from the popup now also targets only the top frame with `frameId: 0`, matching Zapper. This prevents duplicate Inspector HUDs or targeting handlers from starting inside page iframes.
- Context-menu `Quick Hide Element` and `Hide with AI...` now target the frame that opened the context menu via `info.frameId`. AI hider helper injection is also scoped to that frame, so right-click tools do not accidentally start in unrelated frames.
- Inspector runtime now mirrors Zapper's singleton cleanup: it removes stale `zg-inspector-hud` and `zg-inspector-highlight` nodes before mounting and on stop, unregisters UI protection before removal, and ignores Inspector-owned UI as hover targets.
- AI Hider preview state is now frame-local. `AiHider` receives an `onPreview` callback from the owning content script and calls `CosmeticFilter.previewElement` directly, instead of broadcasting `PREVIEW_ELEMENT` / `CLEAR_PREVIEW` through runtime messaging across content-script frames.
- Removed the now-unused `PREVIEW_ELEMENT`, `CLEAR_PREVIEW`, and `PREVIEW_MANUAL_RULE` content-script message handlers after the AI Hider preview became frame-local, closing the stale cross-frame preview surface. Also removed the dead manual-preview `CosmeticFilter` method/scope.
- Content-script messages now pass through an explicit shared `validateContentMessage` contract before the listener dispatches tool commands. The contract accepts only active page-tool/toast/wall-fix/breach-warning commands and rejects removed preview commands. `sendContentMessage` / `sendContentMessageSafely` are typed to the same `ContentMessage` contract so outbound callers cannot silently send stale content commands.
- The background action registry now derives its required handler list from the shared `BACKGROUND_ACTION_MESSAGE_TYPES` constant instead of maintaining a duplicate expected-action array. Unit coverage now proves a complete registry is accepted and a missing shared action is reported.
- App-level background runtime messages are now centralized through `src/js/shared/runtime_messages.ts`. The blocked page and Analyzer no longer call `chrome.runtime.sendMessage` directly for `GET_NETWORK_LOG`, `TEMPORARILY_ALLOW_DOMAIN`, or `APPLY_ALL_RULES`; direct runtime sends remain only inside the shared helper.
- `scripts/check_extension_surface.mjs` now derives auxiliary JS source checks from `scripts/auxiliary_entries.mjs` instead of duplicating per-output source mappings. The surface check also fails if an auxiliary output is duplicated or no longer referenced by `manifest.json`.
- `scripts/check_extension_surface.mjs` now derives extension page checks from `src/pages/*.html` instead of a hard-coded page-to-entry table. Each source page must reference an existing `/src/...ts` module script and any linked local CSS/icon/source assets must exist.
- `scripts/check_dist_surface.mjs` now derives expected built extension pages from `src/pages/*.html` instead of a hard-coded page list, and fails if `dist/src/pages` contains a stale HTML page with no matching source page.
- `scripts/check_extension_surface.mjs` and `scripts/check_dist_surface.mjs` now validate both `manifest.icons` and `manifest.action.default_icon`, require those files to exist, and fail if matching icon sizes point to different paths.
- Packaged e2e localhost servers now use a shared safe-port helper instead of `listen(0)`, avoiding random Chromium `net::ERR_UNSAFE_PORT` failures such as port `1720`.
- Background runtime messages now have a shared `BackgroundActionMessage` union used by `sendMessage` and by the background validator. Runtime notifications remain separate network-log update/reset message types. `ADD_TO_NETWORK_BLOCKLIST` source metadata now uses one shared `NETWORK_BLOCKLIST_SOURCES` constant, including `inspector`, so Inspector-created blocklist rules validate correctly and stay labeled in Settings.
- Background runtime response helpers now expose typed return shapes instead of `unknown`: `getNetworkLog` returns a snapshot, `addToNetworkBlocklist` returns an action-status object, AI helper wrappers expose their known success/error fields, and Local AI classification returns its classifier shape. Analyzer, Logger, Popup, Settings, blocked-page, content self-heal, and AI Hider call sites no longer need local response casts for these helpers.
- `tests/unit/message_runtime.test.ts` now covers the actual background message boundary: unauthorized senders are rejected before dispatch, malformed messages return validator errors, valid messages return async handler responses, thrown handler errors become `{ error }` responses, and `chrome.tabs.onRemoved` still forwards to AI cleanup.
- `src/js/background/modules/message_registry.ts` now maps each background action key to `Extract<ValidatedMessage, { type: key }>` so registries are checked against the exact validated payload for that action. `src/js/background/background.ts` no longer casts the rules, AI, or privacy action registries to `BackgroundActionMap` when combining them.
- `src/js/background/modules/message_actions/rules_actions.ts` now types `broadcastToAllTabs` and reapply-hiding broadcasts as `ContentMessage`, matching `background.ts` and the shared outbound content-message helper. The focused rules-action unit mock uses the same contract.
- `src/js/background/modules/context_menu_runtime.ts` now derives context-menu action command names from `ContentMessage` instead of maintaining a separate duplicate string union for Quick Hide and targeted AI Hide.
- `src/ui/popup/types.ts` now derives popup content-script tool command names from `ContentMessage` for Inspector and Zapper. `src/ui/popup/tool_catalog.ts` now types `isBusyToolAction` against `PageToolActionType` instead of accepting any string.
- `src/js/shared/content_messages.ts` now centralizes payload-free content commands in `SIMPLE_CONTENT_MESSAGE_TYPES`, and `validateContentMessage` routes those commands through that list instead of duplicating them in both a helper and switch cases.
- `src/js/shared/runtime_messages.ts` now centralizes payload-free background actions in `SIMPLE_BACKGROUND_ACTION_MESSAGE_TYPES`, and `validateRuntimeMessage` routes those actions through that list instead of duplicating them in both the message union and switch cases. Unit coverage proves every shared simple background action validates without payload.
- `src/js/shared/storage_api.ts` now accepts readonly string arrays for get/remove key parameters. Settings loaders, Settings export, and storage migrations now pass `as const` key arrays directly with no `as unknown as string[]` casts.
- `src/ui/settings/Settings.svelte` now narrows `keyof SettingsSnapshot` to `CoreSettingId` with an explicit type guard before calling `toggleCoreSetting`, removing the old `settingId as never` cast.
- `src/js/shared/storage_api.ts` now normalizes readonly key arrays before calling Chrome storage and uses a narrow storage-get bridge instead of `as never` casts, while preserving the `chrome.storage.*` method receiver needed by packaged extension pages.
- `src/js/background/modules/message_actions/ai_actions.ts` now exports the `AiModule` type for unit mocks. `tests/unit/ai_actions.test.ts` uses a typed `createMockAiModule` helper, so `rg -n "as never" src tests scripts` returns no matches.
- `src/ui/settings/loaders.ts` now counts cached malware domains directly from the guarded cache array without an `as unknown[]` assertion, with focused coverage for valid and malformed malware cache payloads.
- `src/ui/popup/loaders.ts` now sanitizes legacy privacy stats through an object guard and a guarded `trackersFound` array instead of casting to `unknown[]`.
- `tests/unit/popup_actions.test.ts` now types clipboard write mocks as one-argument string functions, removing the last test `as unknown[]` call inspection. `rg -n "as unknown\\[\\]" src tests scripts` returns no matches.
- `src/js/background/modules/network_logger/runtime.ts` now adapts `chrome.declarativeNetRequest.MatchedRuleInfoDebug` into the logger's internal rule-match shape without a double cast. The internal rule-match request type now matches the fields Chrome actually provides, and `tests/unit/network_logger_runtime.test.ts` covers the adapter.
- `src/js/shared/wall_assist_trace.ts` now sanitizes persisted trace stages and trace records through a local object guard and uses a typed `createRunningTrace` helper for fallback traces. `tests/unit/wall_assist_trace.test.ts` covers malformed stored traces so invalid fields are dropped safely.
- Logger and Analyzer network-log entry types now extend `NetworkLogEntryResponse`, and their loaders normalize missing IDs/timestamps instead of casting response entries. The blocked page visit-anyway helper now consumes the shared runtime entry type directly.
- Settings diagnostics now parses network-log summary entries through a guard-based helper that accepts either raw arrays or `{ entries }` snapshots and drops malformed items without leaking request URLs.
- `src/ui/settings/loaders.ts` now treats storage snapshots as untrusted input with a local object guard, maps rule arrays through `toToggleableRuleArray` before domain/heuristic normalization, merges persistent wall fixes without broad casts, and guards the malware cache entry before reading cached domains.
- `src/ui/settings/settings_controller.ts` now reuses `isObjectLike` while parsing backup toggle rules, custom hiding rules, persistent wall fixes, backup envelopes, legacy raw backup payloads, and local metadata. Wrapped backup local metadata is normalized as it is migrated.
- `src/js/shared/network_blocklist_meta.ts` now normalizes metadata without a generic cast. It canonicalizes hostname keys, keeps the freshest `addedAt`, and drops invalid metadata fields explicitly. Callers no longer pass type arguments, and `tests/unit/network_blocklist_meta.test.ts` covers canonicalization and malformed metadata.

## Recent Important Fixes
- Added missing Google Ad Manager / GPT core protection rules:
  - `||googletagservices.com^`
  - `||securepubads.g.doubleclick.net^`
  - `||tpc.googlesyndication.com^`
  - `gampad/`
  - `pubads_impl`
- Fixed dynamic DNR rule ID collisions that caused errors like:
  - `Rule with id 1042 does not have a unique ID`
  - `Rule with id 1043 does not have a unique ID`
- Widened dynamic rule-family ID ranges so custom network rules do not collide with heuristic rules.
- Added the missing global protection UI in Settings.
- Added import/export support for:
  - core settings
  - Gemini settings
  - custom network blocklist
  - custom hidden rules
  - saved wall fixes
  - paused / isolation / forgetful / focus site lists
  - `networkBlocklistMeta`
- Fixed Logger/Analyzer DNR fallback classification so dynamic rule families use explicit ID ranges. Network, YouTube, and Isolation dynamic rules no longer get mislabeled as Focus Mode just because Focus Mode starts at a lower rule ID.
- Fixed live Logger runtime so it uses the dynamic rule metadata saved by the rule engine. Logger entries now keep exact matched details such as custom blocklist domains and dynamic YouTube override values instead of falling back to generic family text.
- Analyzer findings now preview the normalized custom blocklist candidate before the user clicks `Add to Blocklist`, and the success state uses that same candidate as the matched custom rule value.
- Logger rows now preview the exact normalized custom block candidate before `Add custom block`, and the add path sends that same candidate to the background action.
- Smoke checks now enforce required Google Ad Manager / GPT core filters so those high-value ad rules cannot be removed from both defaults and packaged DNR without failing `check:dnr`.
- Analyzer no longer treats merely seen traffic as blocked. It now adds local actionable findings when the live Logger saw an allowed, uncovered third-party ad-tech request, even if Gemini did not report it.
- Live-tested `https://www.zerogpt.com/` with the packaged `dist` extension after the Google/GPT rule additions.
- Confirmed the packaged extension enables `core_protection` and `youtube_core`, with Google Tag Manager, Google Ads conversion, GPT, SecurePubAds, and Pub Network prebid requests blocked by Chrome (`net::ERR_BLOCKED_BY_CLIENT`).
- Fixed the visible leftover Freestar leaderboard shells on ZeroGPT by adding `.freestar-ad` to safe built-in cosmetic cleanup. Empty Freestar slots and their ad-only wrappers now collapse automatically after delivery requests are blocked.
- Live-scanned `speedtest.net`, `dictionary.com`, `androidauthority.com`, `tomsguide.com`, and `gamespot.com` with the packaged extension. No new visible cosmetic shells were found in that scan, but Dictionary.com exposed allowed ad-tech delivery/sync misses.
- Added observed Dictionary.com network coverage for:
  - `prebid-min.js`
  - `||imasdk.googleapis.com^`
  - `||marketplace.anyclip.com^`
  - `||adsrvr.org^`
  - `||lijit.com^`
  - `||onetag-sys.com^`
- Rebuilt `dist` and verified the watched Dictionary.com requests for those filters are now blocked with `net::ERR_BLOCKED_BY_CLIENT`.
- Live-scanned additional ad-heavy sites: `weather.com`, `howtogeek.com`, `livescience.com`, `space.com`, `cbr.com`, and `makeuseof.com`.
- No new visible cosmetic shells were found in that scan, but Future-owned sites (`livescience.com`, `space.com`) exposed an allowed third-party ad auction/sync stack from Bordeaux/Future and downstream sync vendors.
- Added observed Future-site network coverage for:
  - `||bordeaux.futurecdn.net^`
  - `||servebom.com^`
  - `||sharethrough.com^`
  - `||3lift.com^`
  - `||casalemedia.com^`
  - `||omnitagjs.com^`
  - `||bidswitch.net^`
  - `||yellowblue.io^`
  - `||33across.com^`
- Rebuilt `dist` and verified on both `livescience.com` and `space.com` that the watched Future ad-stack requests are now blocked. Blocking `bordeaux.futurecdn.net/bordeaux.js` stops the downstream sync fan-out before most vendor requests are made.
- Live-scanned `allrecipes.com`, `foodnetwork.com`, `sports.yahoo.com`, `cbssports.com`, `techradar.com`, `screenrant.com`, and `fandom.com` with the packaged extension.
- `allrecipes.com` and `fandom.com` were not useful in that run (`allrecipes.com` did not produce actionable hits; `fandom.com` stopped at Cloudflare).
- No new cosmetic leftovers were found on `techradar.com` or `screenrant.com`. `techradar.com` still loads first-party Bordeaux controller assets, but the third-party `bordeaux.futurecdn.net/bordeaux.js` request is blocked, so do not add a first-party rule unless a visible ad or Logger proof shows one is needed.
- Added observed FoodNetwork / Yahoo Sports / CBSSports network coverage for:
  - `||everesttech.net^`
  - `||liadm.com^`
  - `||thrtle.com^`
  - `prebid-current.js`
  - `prebid-config`
  - `||ay.delivery^`
  - `bidbarrel`
  - `||confiant-integrations.net^`
  - `||ml314.com^`
  - `||crwdcntrl.net^`
  - `||ims-v4.paramount.tech^`
  - `||aniview.com^`
  - `||fwmrm.net^`
- Added safe cosmetic cleanup for observed empty FoodNetwork page-top leaderboard wrappers (`#ad_page_top_1` inside `#leaderboard` / `#leaderboard-wrap`) and Yahoo Sports responsive display ad shells (`.responsive-sda.ad-center`).
- Rebuilt `dist` and verified:
  - FoodNetwork watched EverestTech, LiveIntent, Throtle, and FreeWheel requests are now blocked, with no successful watched responses.
  - FoodNetwork `#leaderboard-wrap`, `#leaderboard`, and `#ad_page_top_1` collapse with `data-zg-cosmetic-cleaned="1"`.
  - Yahoo Sports actual Prebid / `ay.delivery` requests are blocked. Yahoo `noa.yahoo.com` diagnostics may still produce successful telemetry requests whose query text mentions the blocked Prebid URLs; treat those as diagnostic noise, not allowed ad delivery.
  - Yahoo `.responsive-sda.ad-center` shells collapse with `data-zg-cosmetic-cleaned="1"`.
  - CBSSports watched BidBarrel, ML314, Aniview, and Lotame/Crwdcntrl requests are now blocked, with no successful watched responses. Blocking BidBarrel stops most downstream Confiant, Paramount, LiveIntent, Aniview, and FreeWheel fan-out before it starts.
- Live-scanned another news/entertainment batch: `usatoday.com`, `nbcnews.com`, `people.com`, `ew.com`, `polygon.com`, and `ign.com`.
- Added observed USA Today / NBC News / Polygon / IGN network coverage for:
  - `||adsafeprotected.com^`
  - `||trustx.org^`
  - `||smaato.net^`
  - `||colossusssp.com^`
  - `player.ex.co/prebid-bundle`
  - `||sync.ex.co^`
  - `||kargo.com^`
  - `||gumgum.com^`
  - `||postrelease.com^`
  - `||servenobid.com^`
  - `||smilewanted.com^`
  - `||skimresources.com^`
  - `freewheel.js`
  - `||video-ads-module.ad-tech.nbcuni.com^`
  - `||adsninja.ca^`
  - `||brid.tv^`
- Added safe cosmetic cleanup for:
  - Dotdash Meredith ad slots (`mm-ads-*`) observed on People and Entertainment Weekly.
  - NBC News top banner ad shell (`.header-and-footer--banner-ad`).
  - Polygon AdsNinja injected ad zones.
  - IGN Adria empty side rail, sticky, billboard, and half-page ad wrappers.
- Rebuilt `dist` and verified:
  - USA Today watched IAS/AdSafeProtected, TrustX, Smaato, Kargo, PostRelease/Nativo, Colossus SSP, Ex.co prebid/sync requests are now blocked, with no successful watched responses.
  - NBC News watched Skimresources, JW Player `freewheel.js`, and NBCU `freewheel-params` requests are now blocked, with no successful watched responses. The top banner shell collapses with `data-zg-cosmetic-cleaned="1"`.
  - People and Entertainment Weekly `mm-ads-*` GPT slots collapse with `data-zg-cosmetic-cleaned="1"`.
  - Polygon `adsninja.ca` scripts are blocked and the previously observed AdsNinja injected shells are no longer visible.
  - IGN Adria Brid outstream is blocked and `.side-ad-trail`, `.ad-wrapper.pgQSsticky`, `.zad.billboard`, and `.zad.halfpage` collapse with `data-zg-cosmetic-cleaned="1"`.
- Live-scanned another news/tech batch: `cnn.com`, `foxnews.com`, `nypost.com`, `businessinsider.com`, `digitaltrends.com`, and `pcgamer.com`.
- Added observed third-party network coverage for:
  - `||permutive.com^`
  - `||permutive.app^`
  - `||criteo.net^`
  - `||ads-configs-cdn.openweb.com^`
  - `||dotomi.com^`
  - `||tapad.com^`
  - `||uidapi.com^`
  - `||lngtdv.com^`
  - `||adentifi.com^`
  - `||ipredictive.com^`
- Added safe cosmetic cleanup for:
  - Fox News ad bootstrap containers (`.ad-container.desktop`, `.ad.gam`).
  - NYPost advertisement label shells and DFP rail wrappers (`.ad.ad--container`, `.widget_nypost_dfp_ad_widget`).
- Rebuilt `dist` and verified:
  - CNN, NYPost, and Business Insider Permutive requests are now blocked when observed, with no successful watched Permutive responses.
  - Fox News `static.criteo.net` is blocked, and visible Fox ad containers collapse with `data-zg-cosmetic-cleaned="1"`.
  - NYPost `ads-configs-cdn.openweb.com` and `static.criteo.net` are blocked, and NYPost ad label / DFP rail wrappers collapse with `data-zg-cosmetic-cleaned="1"`.
  - Digital Trends watched UID2/Lngtdv requests are blocked when observed, with no successful watched responses for the patched vendors.
- Notes from the scan:
  - Fox News still serves first-party `static.foxnews.com/static/strike/scripts/libs/prebid.js`; NYPost still serves first-party `ads.nypost.com` ad scripts/config. These are same-site delivery surfaces, so do not treat the third-party static DNR path as able to block them. Current handling is cosmetic cleanup unless a dedicated first-party/site-specific rule path is added later.
  - PCGamer only showed a first-party `pcgamer.com/vite/assets/Ads/Ads.ts...` asset while third-party IMA/GTM were blocked; no cosmetic patch was needed.
- Manually live-scanned `https://noodlemagazine.com/watch/-176653532_456239081` with the packaged `dist` extension after a user request for this specific page. Treat this as ad/tracker coverage only; do not document or inspect page media content.
- Added observed NoodleMagazine third-party network coverage for:
  - `||tsyndicate.com^`
  - `||mc.yandex.ru^`
  - `||mc.webvisor.org^`
  - `||rtbsuperhub.com^`
  - `||coosync.com^`
  - `||aj2555.bid^`
- Rebuilt `dist` and verified on the same NoodleMagazine watch page:
  - No successful watched responses remained for the patched vendors.
  - Observed `cdn.tsyndicate.com`, `mc.yandex.ru`, `mc.webvisor.org`, `coosync.com`, and `aj2555.bid` requests were blocked with `net::ERR_BLOCKED_BY_CLIENT`.
  - The initially observed downstream `rtbsuperhub.com` request no longer fired after upstream blocking.
- NoodleMagazine cosmetic note:
  - A possible 900x250 iframe was not stable across runs. The repeatable DOM marker was only a tiny hidden `.afs_ads.ad-placement` bait/slot, so no cosmetic selector was added.
- Live-scanned another ad-heavy entertainment/news batch: `dailymail.co.uk`, `tmz.com`, `variety.com`, `rollingstone.com`, `thewrap.com`, and `dexerto.com`.
- Added observed Daily Mail / TMZ / Rolling Stone / TheWrap / Dexerto third-party network coverage for:
  - `dailymail.com/static/mol-adverts/`
  - `||idsync.anm.co.uk^`
  - `||idsync.dailymail.com^`
  - `||stackadapt.com^`
  - `||visualwebsiteoptimizer.com^`
  - `||cds.connatix.com^`
  - `||capi.connatix.com^`
  - `||ins.connatix.com^`
  - `||htlbid.com^`
  - `||sitescout.com^`
  - `||analytics.tiktok.com^`
  - `||mon.tiktokv.com^`
  - `||mcs-sg.tiktokv.com^`
  - `||chartbeat.com^`
  - `||chartbeat.net^`
  - `||merequartz.com^`
  - `||html-load.com^`
  - `||optmn.cloud^`
  - `||p7cloud.net^`
  - `||zipthelake.com^`
  - `strike.fox.com/static/tmz/display/loader.js`
- Added safe cosmetic cleanup for:
  - Daily Mail `.mol-ads-label-container` / `.mol-ads-label` advertisement strips.
  - Rolling Stone page-top GPT leaderboard shells (`.above-header-ad`, `#adm-leaderboard`, `gpt-*` ad slots).
  - TheWrap header/skin ad wrappers (`.site-header-ad-wrapper`, `.wp-block-the-wrap-ad`, `.yad-skin-ad-top`).
  - Dexerto sidebar and bottom adhesion ad modules (`Ad-module-scss-module` shells, `#bottom-adhesion`).
- Rebuilt `dist` and verified:
  - Daily Mail watched `mol-adverts`, `idsync`, StackAdapt, and Visual Website Optimizer requests are now blocked, with no successful watched responses. Daily Mail ad label strips collapse with `data-zg-cosmetic-cleaned="1"`.
  - TMZ watched Connatix, Zipthelake, Chartbeat, TikTok telemetry, and the TMZ/Fox display loader are now blocked. A second pass caught and fixed TikTok `ping` requests by including `ping` in the new static rule resource types.
  - Rolling Stone watched `html-load.com`, Connatix, and Merequartz requests are now blocked, and page-top GPT leaderboard shells collapse with `data-zg-cosmetic-cleaned="1"`.
  - TheWrap watched Connatix and `htlbid.com` requests are now blocked. A second pass caught and fixed `htlbid` stylesheet delivery by including `stylesheet` in the new static rule resource types. TheWrap skin/header ad wrappers collapse with `data-zg-cosmetic-cleaned="1"`.
  - Dexerto watched `html-load.com`, `optmn.cloud`, Chartbeat, P7Cloud, and Merequartz requests are now blocked, and sidebar / bottom adhesion shells collapse with `data-zg-cosmetic-cleaned="1"`.
- Notes from the scan:
  - Daily Mail still loads same-owner non-ad modules from `scripts.dailymail.com` and push-notification code from `hulkprod.anm.co.uk`; those were not patched because the observed issue was the `mol-adverts` bootstrap, ID sync, StackAdapt, and VWO tracking.
  - TheWrap and TMZ use Connatix for both player/content and ad-related scripts. The patch blocks observed ad/insight/control subdomains (`cds`, `capi`, `ins`) and leaves `vid.connatix.com` media delivery alone.
- Manually compatibility-audited `tiktok.com` itself as a privacy-hardening target, not an ad-blocking target.
- TikTok audit result:
  - Current packaged `dist` still loads TikTok Explore and `@tiktok` profile pages.
  - Video elements reached `readyState: 4` and played from blob URLs during the audit.
  - Existing third-party telemetry rules blocked many `mcs-sg.tiktokv.com` and `mon.tiktokv.com` XHR/fetch requests without breaking the tested logged-out experience.
  - A stricter temporary interception experiment blocking Slardar monitoring scripts on `sf16-website-login.neutral.ttwstatic.com` and `mssdk-sg.tiktok.com/web/report` made TikTok render blank in the automated run. Do not add those rules without a more precise compatibility strategy.
- TikTok audit notes:
  - Leave TikTok CDN/media hosts, login/security/captcha hosts, `mssdk` resource/version/common endpoints, feed/profile APIs, and `tiktokcdn` image/video hosts alone.
  - Treat any future TikTok work as compatibility-first path-level privacy hardening. Avoid broad TikTok-family domain rules.
- Live-scanned another general/health publisher batch: `boredpanda.com`, `ranker.com`, `mentalfloss.com`, `webmd.com`, `healthline.com`, and `medicalnewstoday.com`.
- Added observed BoredPanda / Ranker / MentalFloss / WebMD / Healthline / MedicalNewsToday network coverage for:
  - `||primis.tech^`
  - `||bouncex.net^`
  - `||bounceexchange.com^`
  - `||ad-delivery.net^`
  - `||btloader.com^`
  - `||eyeota.net^`
  - `||wknd.ai^`
  - `||analytics.yahoo.com^`
  - `||inmobi.com^`
  - `||aaxads.com^`
  - `||tremorhub.com^`
  - `||adthrive.com^`
  - `||quantserve.com^`
  - `||adrecover.com^`
  - `||ad.gt^`
  - `||adspsp.com^`
  - `||ads-twitter.com^`
  - `redditstatic.com/ads/`
  - `||pixel-config.reddit.com^`
  - `||alb.reddit.com^`
  - `||googleadservices.com^`
- Added safe cosmetic cleanup for WebMD-style ad-position placeholders (`[id^="ad-pos-"]` / `ad-pos-` hint) left behind after ad delivery blocks.
- Fixed a fresh-profile startup weakness found during packaged live verification:
  - Background service-worker load now reconciles settings, migrations, context menus, and rule application even when Chrome does not deliver the expected install/startup event before a scan.
  - Built-in core rule toggles now store only disabled overrides in `chrome.storage.sync`, avoiding the `QUOTA_BYTES_PER_ITEM` failure caused by writing the full default core list during first-run initialization.
  - Background `applyRules()` calls are serialized so install/startup/storage-triggered rule applications cannot race into duplicate dynamic rule IDs.
- Rebuilt `dist` and verified with a fresh unpacked Chrome profile:
  - `core_protection` and `youtube_core` are enabled automatically.
  - `settingsInitialized` and `isProtectionEnabled` are set.
  - `defaultBlocklist` remains compact as `[]` when no built-in rules are disabled.
  - Dynamic rules apply without background console errors.
- Rebuilt `dist` and verified the publisher batch:
  - BoredPanda watched Primis, AAX, BTLoader, Eyeota, and WKND requests are blocked, with no successful watched responses.
  - Ranker watched AdThrive, Quantserve, and `a.ad.gt` requests are blocked, with no successful watched responses.
  - MentalFloss watched `ad-delivery.net` and `a.ad.gt` requests are blocked, with no successful watched responses.
  - WebMD watched Twitter ads, Yahoo analytics, Google Ads conversion, and Reddit ads requests are blocked, with no successful watched responses. WebMD `ad-pos` placeholders are not visible after cleanup.
  - Healthline watched AdsPSP, Yahoo analytics, and Reddit ads requests are blocked, with no successful watched responses.
  - MedicalNewsToday watched AdsPSP requests are blocked, with no successful watched responses.
- Live-scanned another tech / G/O Media batch: `forbes.com`, `cnet.com`, `zdnet.com`, `gizmodo.com`, `kotaku.com`, and `lifehacker.com`.
- Added observed CNET / ZDNet / Gizmodo / Kotaku / Lifehacker network coverage for:
  - `||dv.tech^`
  - `||zdbb.net^`
  - `||getadmiral.com^`
  - `||optidigital.com^`
  - `||opti-digital.com^`
  - `||presage.io^`
  - `||seedtag.com^`
  - `||adx.opera.com^`
  - `||oa.opera.com^`
  - `temu.com/api/adx/cm/pixel-opera`
  - `||demdex.net^`
  - `||sddan.com^`
  - `||richaudience.com^`
  - `||1rx.io^`
  - `cdn.jsdelivr.net/gh/prebid/currency-file`
  - `||deepintent.com^`
  - `spot.im/production/ads/`
  - `spot.im/ad/event-tracking/`
- Added safe cosmetic cleanup for Ziff Davis skybox ad shells (`.c-adSkyBox`) observed on CNET and ZDNet after delivery scripts were blocked.
- Rebuilt `dist` and verified:
  - CNET and ZDNet watched DoubleVerify `dv.tech`, Ziff Davis `zdbb.net`, and Admiral requests are blocked, with no successful watched responses. `.c-adSkyBox` shells collapse with `data-zg-cosmetic-cleaned="1"`.
  - Gizmodo and Kotaku watched OptiDigital and `sddan.com` requests are blocked, with no successful watched responses for the patched vendors. Some downstream Seedtag / Presage / Opera / RichAudience / 1rx sync traffic did not refire after upstream OptiDigital blocking.
  - Lifehacker watched `dv.tech`, `zdbb.net`, and Spot.im ad/event-tracking paths are blocked, with no successful watched responses.
- Notes from the scan:
  - Forbes produced DataDome / captcha-delivery traffic plus already-covered Criteo, Amazon Ads, IAS, GPT, and GTM blocks. No new rule was added for Forbes because the remaining successful requests were bot-protection/captcha assets.
  - CNET/ZDNet still load consent/survey surfaces such as OneTrust, Google Funding Choices, and Qualtrics; those were not patched because they are not ad delivery and may be user-facing consent or feedback flows.
  - G/O Media pages loaded `cd.connatix.com/connatix.player.js`; leave that alone for now because Connatix player domains can carry content video. Existing Connatix ad/insight/control subdomain blocks remain in place.
- Live-scanned `msn.com` with the packaged `dist` extension after returning to ad-blocking work.
- Added narrow observed MSN/Bing ad mediation tracking coverage for:
  - `bing.com/api/v1/mediation/tracking`
- Added observed LinkedIn ad identity-sync coverage from the MSN scan for:
  - `||px.ads.linkedin.com^`
- MSN note:
  - Leave broad first-party MSN/Bing telemetry and bundled `assets.msn.com` ad-service code alone unless Logger proof shows visible ad delivery or breakage-safe path-level coverage. The added rule targets the repeated mediation tracking endpoint with ad query fields.
- Rebuilt `dist` and verified on `msn.com` in a fresh Chrome-for-Testing profile:
  - `core_protection` and `youtube_core` enabled before page load.
  - observed `www.bing.com/api/v1/mediation/tracking` image requests are blocked with `net::ERR_BLOCKED_BY_CLIENT`.
  - observed `px.ads.linkedin.com/setuid` image requests are blocked with `net::ERR_BLOCKED_BY_CLIENT`.
- Added `npm run scan:live -- <url>` as a reusable packaged-extension scan harness. It uses Puppeteer's bundled Chrome-for-Testing, verifies ZenithGuard's service worker and enabled DNR rulesets before scanning, summarizes blocked hosts, and reports allowed ad-signal samples for manual review.
- Added a Settings Dashboard `Extension Health` card that reports:
  - enabled static rulesets
  - dynamic DNR rule count
  - storage initialization state
  - global protection state
  - pause state
  - session allowlist count
  - disabled site count
  - compact built-in rule override count
  - extension version and ID
- The health card raises attention issues when settings are not initialized, global protection is off, protection is paused, the core static ruleset is disabled, or YouTube rules are expected but not enabled.
- Rebuilt `dist` and verified the packaged settings page in a fresh unpacked Chrome profile:
  - `Extension Health` showed `Ready`.
  - `core_protection` and `youtube_core` were enabled.
  - dynamic DNR rule count was 26.
  - storage was initialized and global protection was on.
- Added `Copy Diagnostics` to the Settings Dashboard `Extension Health` card.
- The copied diagnostics payload is JSON with:
  - `zenithguard-extension-diagnostics` format/version
  - generated timestamp
  - browser user agent
  - extension ID and manifest version
  - health status
  - enabled rulesets
  - dynamic DNR rule count
  - static core / YouTube ruleset state
  - settings initialization and global protection state
  - pause, session allowlist, disabled-site, default-override counts
  - health issues
- The copy action first tries `navigator.clipboard.writeText`, then falls back to a temporary textarea copy path when Chromium denies direct clipboard writes on the extension page.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that clicking `Copy Diagnostics` shows `Copied extension diagnostics.` and copies valid diagnostics JSON containing `core_protection`, `youtube_core`, 26 dynamic rules, initialized storage, and protection on.
- Added `Download Diagnostics` beside `Copy Diagnostics` on the Settings Dashboard `Extension Health` card.
- The download action reuses the same diagnostics JSON payload and saves it as `zenithguard_diagnostics.json` through a blob anchor download. It does not depend on `chrome.downloads`, which is unavailable in the settings page context.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that clicking `Download Diagnostics` shows `Started diagnostics download.` and writes `zenithguard_diagnostics.json` containing `core_protection`, `youtube_core`, 26 dynamic rules, initialized storage, and protection on.
- Added a reversible `Re-enable Protection` repair action to the Settings Dashboard `Extension Health` card. It appears only when global protection is off.
- The repair action uses the existing background `TOGGLE_GLOBAL_PROTECTION` path so the saved setting, static rulesets, and dynamic rules are restored before the settings health refresh reads runtime state.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile:
  - Forced `isProtectionEnabled` to `false`.
  - Health card showed `Needs Attention`, `Global Protection Off`, and the `Re-enable Protection` repair button.
  - Clicking the repair set `isProtectionEnabled` back to `true`.
  - `core_protection` and `youtube_core` were enabled again.
  - dynamic DNR rules returned to 26.
  - Health card returned to `Ready` and hid the repair button.
- Added a reversible `Resume Protection` repair action to the Settings Dashboard `Extension Health` card. It appears only when a temporary pause is active.
- The resume repair uses the existing background `RESUME_PROTECTION` path so `protectionPausedUntil` is cleared, the resume alarm is cleared, and rules are restored before the settings health refresh reads runtime state.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile:
  - Paused protection through the packaged background action.
  - Health card showed `Needs Attention`, an active pause time, and the `Resume Protection` repair button.
  - During pause, static rulesets were disabled and dynamic DNR rules were 0.
  - Clicking the repair cleared `protectionPausedUntil`.
  - `core_protection` and `youtube_core` were enabled again.
  - dynamic DNR rules returned to 26.
  - Health card returned to `Ready` and hid the repair button.
- Added redacted active-tab context to the Settings Dashboard diagnostics payload.
- The diagnostics context selects the most recent normal web tab in the current window, skipping the extension Settings tab, and records only origin, hostname/domain, protocol, redacted URL, tab/window IDs, and path/query/hash booleans.
- Full paths, query strings, and fragments are intentionally omitted from diagnostics JSON so manual site reports get useful site context without copying private URL details.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that `Copy Diagnostics` captures the recent web tab context from `https://example.com/sensitive/path?token=secret#frag` as `example.com` / `https://example.com/[path]` with path/query/hash booleans, without copying the sensitive path, query token, or fragment.
- Added a visible `Diagnostics Site` row to the Settings Dashboard `Extension Health` card so the redacted site context is visible before copying or downloading diagnostics.
- Added a visible `Refresh Health` action to the health card. It reruns the same settings/dashboard/health/site-context refresh path without reloading Settings.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that:
  - `Diagnostics Site` shows `example.com` for a recent `https://example.com/private/path?token=secret#hidden` web tab.
  - `Refresh Health` shows `Health refreshed.`.
  - copied diagnostics still include `example.com` / `https://example.com/[path]` without copying the private path, query token, or fragment.
- Added an `Open Logger` action beside the health diagnostics buttons. It uses the same diagnostics-site context to open Logger for the captured web tab with the redacted domain as the initial search.
- The Logger shortcut is disabled when no current-window web tab is available, and it does not include full URL path, query, or fragment details in the Logger URL.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that clicking `Open Logger` from Settings opens `src/pages/logger.html` with a numeric `tabId`, `search=example.com`, and `status=all` for a recent `https://example.com/manual/report?case=private#part` tab, without leaking the private URL parts.
- Added an `Open Analyzer` action beside the health diagnostics buttons. It uses the same diagnostics-site context to open Analyzer for the captured web tab.
- The Analyzer shortcut is disabled when no current-window web tab is available, and it does not include full URL path, query, or fragment details in the Analyzer URL.
- Rebuilt `dist` and verified in a fresh unpacked Chrome profile that clicking `Open Analyzer` from Settings opens `src/pages/analyzer.html` with a numeric `tabId` for a recent `https://example.com/analyzer/report?case=private#part` tab, without leaking the private URL parts.
- Added a diagnostics payload schema unit test that locks the top-level report keys plus `browser`, `pageContext`, `runtime`, and `protection` nested keys.
- The schema test also asserts diagnostics still redact full page path, query token, and hash details while preserving the redacted origin/domain context.

## Current Verification Baseline
- `npm run test:smoke` passes.
- `npm run build` passes.
- `npx svelte-check` passes with 0 errors and 0 warnings.
- Packaged `dist` settings-page verification passes in a fresh unpacked Chrome profile, including the `Extension Health` card, `Copy Diagnostics`, `Download Diagnostics`, `Re-enable Protection`, and `Resume Protection` repair actions.
- Focused diagnostics coverage confirms active-tab context redacts path/query/hash details before the report is copied or downloaded.
- Packaged diagnostics verification confirms copied diagnostics include redacted recent-web-tab context from the real Chrome `tabs` API.
- Packaged health-card verification confirms the `Diagnostics Site` preview row and `Refresh Health` action work in the real Settings page.
- Packaged Logger shortcut verification confirms the health card opens Logger for the diagnostics tab with redacted domain search only.
- Packaged Analyzer shortcut verification confirms the health card opens Analyzer for the diagnostics tab with only a numeric tab ID.
- Focused diagnostics schema coverage confirms copied/downloaded diagnostics keep the expected JSON shape and redaction guarantees.

## Main Direction Now
The live-site coverage track is intentionally paused unless the user reports a specific site. The immediate coding direction is extension observability and diagnostics: make it easier to see whether the packaged browser runtime is healthy before debugging site-specific behavior.

## Work Track 1: Core Protection Accuracy
Goal: verify real ad/tracker blocking on live sites.

Done:
1. Added explicit `check:dnr` invariants for the Google Ad Manager / GPT filters already added to core protection:
   - `||googletagservices.com^`
   - `||securepubads.g.doubleclick.net^`
   - `||tpc.googlesyndication.com^`
   - `gampad/`
   - `pubads_impl`
2. Added explicit `check:dnr` invariants for observed Dictionary.com ad-tech misses:
   - `prebid-min.js`
   - `||imasdk.googleapis.com^`
   - `||marketplace.anyclip.com^`
   - `||adsrvr.org^`
   - `||lijit.com^`
   - `||onetag-sys.com^`
   - `||bordeaux.futurecdn.net^`
   - `||servebom.com^`
   - `||sharethrough.com^`
   - `||3lift.com^`
   - `||casalemedia.com^`
   - `||omnitagjs.com^`
   - `||bidswitch.net^`
   - `||yellowblue.io^`
   - `||33across.com^`
3. Added explicit `check:dnr` invariants for observed FoodNetwork / Yahoo Sports / CBSSports ad-tech misses:
   - `||everesttech.net^`
   - `||liadm.com^`
   - `||thrtle.com^`
   - `prebid-current.js`
   - `prebid-config`
   - `||ay.delivery^`
   - `bidbarrel`
   - `||confiant-integrations.net^`
   - `||ml314.com^`
   - `||crwdcntrl.net^`
   - `||ims-v4.paramount.tech^`
   - `||aniview.com^`
   - `||fwmrm.net^`
4. Added explicit `check:dnr` invariants for observed USA Today / NBC News / Polygon / IGN ad-tech misses:
   - `||adsafeprotected.com^`
   - `||trustx.org^`
   - `||smaato.net^`
   - `||colossusssp.com^`
   - `player.ex.co/prebid-bundle`
   - `||sync.ex.co^`
   - `||kargo.com^`
   - `||gumgum.com^`
   - `||postrelease.com^`
   - `||servenobid.com^`
   - `||smilewanted.com^`
   - `||skimresources.com^`
   - `freewheel.js`
   - `||video-ads-module.ad-tech.nbcuni.com^`
   - `||adsninja.ca^`
   - `||brid.tv^`
5. Added explicit `check:dnr` invariants for observed CNN / Fox News / NYPost / Business Insider / Digital Trends third-party misses:
   - `||permutive.com^`
   - `||permutive.app^`
   - `||criteo.net^`
   - `||ads-configs-cdn.openweb.com^`
   - `||dotomi.com^`
   - `||tapad.com^`
   - `||uidapi.com^`
   - `||lngtdv.com^`
   - `||adentifi.com^`
   - `||ipredictive.com^`
6. Added explicit `check:dnr` invariants for observed NoodleMagazine third-party misses:
   - `||tsyndicate.com^`
   - `||mc.yandex.ru^`
   - `||mc.webvisor.org^`
   - `||rtbsuperhub.com^`
   - `||coosync.com^`
   - `||aj2555.bid^`
7. Added explicit `check:dnr` invariants for observed Daily Mail / TMZ / Rolling Stone / TheWrap / Dexerto misses:
   - `dailymail.com/static/mol-adverts/`
   - `||idsync.anm.co.uk^`
   - `||idsync.dailymail.com^`
   - `||stackadapt.com^`
   - `||visualwebsiteoptimizer.com^`
   - `||cds.connatix.com^`
   - `||capi.connatix.com^`
   - `||ins.connatix.com^`
   - `||htlbid.com^`
   - `||sitescout.com^`
   - `||analytics.tiktok.com^`
   - `||mon.tiktokv.com^`
   - `||mcs-sg.tiktokv.com^`
   - `||chartbeat.com^`
   - `||chartbeat.net^`
   - `||merequartz.com^`
   - `||html-load.com^`
   - `||optmn.cloud^`
   - `||p7cloud.net^`
   - `||zipthelake.com^`
   - `strike.fox.com/static/tmz/display/loader.js`
8. Added explicit `check:dnr` invariants for observed BoredPanda / Ranker / MentalFloss / WebMD / Healthline / MedicalNewsToday misses:
   - `||primis.tech^`
   - `||bouncex.net^`
   - `||bounceexchange.com^`
   - `||ad-delivery.net^`
   - `||btloader.com^`
   - `||eyeota.net^`
   - `||wknd.ai^`
   - `||analytics.yahoo.com^`
   - `||inmobi.com^`
   - `||aaxads.com^`
   - `||tremorhub.com^`
   - `||adthrive.com^`
   - `||quantserve.com^`
   - `||adrecover.com^`
   - `||ad.gt^`
   - `||adspsp.com^`
   - `||ads-twitter.com^`
   - `redditstatic.com/ads/`
   - `||pixel-config.reddit.com^`
   - `||alb.reddit.com^`
   - `||googleadservices.com^`
9. Added explicit `check:dnr` invariants for observed CNET / ZDNet / Gizmodo / Kotaku / Lifehacker misses:
   - `||dv.tech^`
   - `||zdbb.net^`
   - `||getadmiral.com^`
   - `||optidigital.com^`
   - `||opti-digital.com^`
   - `||presage.io^`
   - `||seedtag.com^`
   - `||adx.opera.com^`
   - `||oa.opera.com^`
   - `temu.com/api/adx/cm/pixel-opera`
   - `||demdex.net^`
   - `||sddan.com^`
   - `||richaudience.com^`
   - `||1rx.io^`
   - `cdn.jsdelivr.net/gh/prebid/currency-file`
   - `||deepintent.com^`
   - `spot.im/production/ads/`
   - `spot.im/ad/event-tracking/`
10. Added explicit `check:dnr` invariant for observed MSN/Bing ad mediation tracking:
   - `bing.com/api/v1/mediation/tracking`
11. Added explicit `check:dnr` invariant for observed LinkedIn ad identity sync:
   - `||px.ads.linkedin.com^`
12. Added targeted Grok first-party privacy filters:
   - `||grok.com/_data/v1/events^`
   - `||grok.com/api/log_metric^`
   - `||grok.com/_data/v1/a/t^`
   - `||grok.com/_data/v1/a/engage^`
   - `||grok.com/_data/v1/a/record^`
   - `||grok.com/monitoring^`
   - Stripe rules from the user-provided Reddit list were not added because `js.stripe.com` / `m.stripe.com` can break legitimate checkout and payment flows.
13. Added `check:dnr` invariants for the Grok privacy filters so they cannot be removed from both defaults and packaged DNR without smoke failing. These invariants also verify the rules are not scoped to `thirdParty`, because the Grok telemetry endpoints are first-party paths.
14. Live-verified `https://grok.com/` with the packaged `dist` extension:
   - logged-out Grok rendered visible sign-in/sign-up content and controls
   - `core_protection` was enabled
   - real `/monitoring`, `/_data/v1/events`, `/api/log_metric`, and `/_data/v1/a/t` traffic was blocked by DNR during load
   - explicit probes for all six Grok privacy filters failed at the page level with `net::ERR_BLOCKED_BY_CLIENT`
   - no watched Grok telemetry path returned a successful response

Next steps:
1. Continue live testing ad-heavy sites, but do not repeat the completed ZeroGPT/Dictionary automated checks unless a manual session disagrees.
2. If a visible ad still appears, open Logger immediately while it is visible.
3. Filter Logger for:
   - `google`
   - `doubleclick`
   - `gampad`
   - `pubads`
   - `googlesyndication`
   - `googletagservices`
   - `prebid`
   - `imasdk`
   - `anyclip`
   - `adsrvr`
   - `lijit`
   - `onetag`
   - `bordeaux`
   - `servebom`
   - `sharethrough`
   - `3lift`
   - `casalemedia`
   - `omnitagjs`
   - `bidswitch`
   - `yellowblue`
   - `33across`
   - `everesttech`
   - `liadm`
   - `thrtle`
   - `prebid-current`
   - `prebid-config`
   - `ay.delivery`
   - `bidbarrel`
   - `confiant`
   - `ml314`
   - `crwdcntrl`
   - `paramount`
   - `aniview`
   - `fwmrm`
   - `adsafeprotected`
   - `trustx`
   - `smaato`
   - `colossusssp`
   - `ex.co`
   - `kargo`
   - `gumgum`
   - `postrelease`
   - `servenobid`
   - `smilewanted`
   - `skimresources`
   - `freewheel`
   - `nbcuni`
   - `adsninja`
   - `brid.tv`
   - `permutive`
   - `criteo.net`
   - `openweb`
   - `dotomi`
   - `tapad`
   - `uidapi`
   - `lngtdv`
   - `adentifi`
   - `ipredictive`
   - `tsyndicate`
   - `mc.yandex`
   - `webvisor`
   - `rtbsuperhub`
   - `coosync`
   - `aj2555`
   - `mol-adverts`
   - `idsync`
   - `stackadapt`
   - `visualwebsiteoptimizer`
   - `connatix`
   - `htlbid`
   - `sitescout`
   - `tiktokv`
   - `chartbeat`
   - `merequartz`
   - `html-load`
   - `optmn`
   - `p7cloud`
   - `zipthelake`
   - `strike.fox`
   - `primis`
   - `bouncex`
   - `bounceexchange`
   - `ad-delivery`
   - `btloader`
   - `eyeota`
   - `wknd.ai`
   - `analytics.yahoo`
   - `inmobi`
   - `aaxads`
   - `tremorhub`
   - `adthrive`
   - `quantserve`
   - `adrecover`
   - `ad.gt`
   - `adspsp`
   - `ads-twitter`
   - `redditstatic`
   - `pixel-config.reddit`
   - `alb.reddit`
   - `googleadservices`
   - `bing.com/api/v1/mediation/tracking`
   - `px.ads.linkedin`
   - `dv.tech`
   - `zdbb`
   - `getadmiral`
   - `optidigital`
   - `opti-digital`
   - `presage`
   - `seedtag`
   - `adx.opera`
   - `oa.opera`
   - `pixel-opera`
   - `demdex`
   - `sddan`
   - `richaudience`
   - `1rx`
   - `prebid/currency-file`
   - `deepintent`
   - `spot.im`
4. Decide from Logger whether the issue is:
   - missed network rule
   - first-party/self-hosted ad markup
   - cosmetic leftover after a blocked request
   - non-Google ad vendor
5. Add only targeted rules based on observed requests.

Do not add broad random ad rules without Logger proof.

## Work Track 2: Rule Engine Integrity
Goal: prevent DNR rule-family bugs from coming back.

Done:
1. Added DNR validation to `test:smoke`.
2. Validates `rules/core_protection.json` has unique IDs and valid rule shapes.
3. Validates `rules/youtube_core.json` has unique IDs and valid rule shapes.
4. Validates dynamic rule-family ranges do not overlap:
   - heuristic
   - focus mode
   - custom network blocklist
   - YouTube dynamic rules
   - isolation mode
   - URL cleaner
   - user allowlist
   - malware rules
5. Validates source constants stay aligned with those ranges.
6. Added unit coverage for DNR fallback metadata classification and status.

Next steps:
1. Add more budget-order tests if priority changes again.
2. Keep using `npm run test:smoke` before live testing because it now catches the duplicate-ID class before Chrome does.

## Work Track 3: Logger / Analyzer Truth
Goal: make the tools explain blocking accurately.

Done:
1. Confirmed `Add to Blocklist` sanitizes wildcard/pattern inputs before storage.
2. Confirmed duplicate dynamic rule ID failures are covered by DNR validation and smoke tests.
3. Fixed Logger fallback rule-family classification.
4. Fixed live Logger runtime to preserve exact dynamic rule metadata.
5. Added Analyzer UI transparency for the exact normalized blocklist candidate.
6. Added Logger UI transparency for the exact normalized custom block candidate.
7. Fixed Analyzer observed coverage so only blocked observed traffic counts as blocked.
8. Added local Analyzer fallback findings for allowed, uncovered third-party ad-tech requests from the live network log.
9. Exposed `initiator` on Analyzer network log entries so local fallback findings can suppress same-site false positives.
10. Added targeted Analyzer fallback detection for allowed, uncovered third-party video-ad delivery signals such as IMA, VAST, VPAID, preroll, midroll, outstream, and instream.
11. Added coverage to avoid flagging ordinary third-party video delivery that lacks ad-delivery signals.
12. Shared the Analyzer ad-tech signal vocabulary with Logger so live allowed requests now show a specific review reason for uncovered video-ad or ad-tech delivery misses.
13. Added a Logger `Review` filter that narrows the table to allowed, uncovered third-party requests that can be promoted into custom block rules.
14. Added a live count badge to the Logger `Review` filter so reviewable misses are visible before filtering the table.
15. Added a read-only `Copy Review List` action that exports reviewable Logger misses as plain text for manual site reports.
16. Fixed Analyzer support-data refresh behavior so `Add to Blocklist` keeps the current report visible and marks it stale instead of clearing it. Active in-flight scans are still invalidated if rules change mid-scan.
17. Added a popup `Report This Site` copy action for future manual reports. The report includes page URL, policy state, request counts, recent tool activity, recent network decisions, and matched rule details, with unit coverage for formatter output and clipboard action logging.
18. Expanded the copied site report with a `Review Candidates` section that flags allowed third-party ad-tech/video-ad misses using the same signal vocabulary as Logger review. This gives future manual reports immediate candidate domains and reasons without opening Logger first.
19. Added packaged e2e coverage for the popup report flow:
   - loads built `dist` into Chrome
   - opens a local web page as the active tab
   - opens the popup page against that active tab context
   - selects Tools
   - verifies `Report This Site` and `Copy Site Report`
   - clicks the report action
   - verifies the success status and `Site Report` tool activity entry
20. Added an `Open Logger Review` follow-up to the `Site Report Copied` status card and persisted tool-activity entry. The action uses the same popup follow-up path as Inspector/Settings actions and opens Logger for the captured tab ID with `status=allowed` and `review=needs-review`.

Next steps:
1. Use Logger `Review` and `Copy Review List` first when manually investigating a reported site with visible ads or leftover shells.
2. Use popup `Tools -> Report This Site -> Copy Site Report` when the user manually reports a site issue and wants to paste the current page context into chat.
3. Continue expanding local ad-tech signals only from observed misses, not broad guesswork.

## Work Track 4: Cosmetic Cleanup After Blocking
Goal: handle visible ad shells after network blocking succeeds.

Done:
1. Fixed built-in cosmetic cleanup so it remains active even when there are no site-specific custom hiding rules.
2. Added a lightweight built-in cleanup observer that collapses late-inserted Google/GPT/ad-slot placeholders after blocked ad scripts mutate the page.
3. Added unit coverage for a late `google_ads_iframe` placeholder inside an ad container.
4. Expanded safe Google/GPT cosmetic cleanup to collapse generic ad-only wrappers around known ad iframes.
5. Added safety coverage to ensure containers with meaningful page text are not collapsed just because they contain an ad iframe.
6. Added rate-limited `Cosmetic Cleanup` tool activity so popup history can show when leftover ad shells were collapsed.
7. Updated popup Tools history copy and loader coverage so automatic cosmetic cleanup activity is clearly scoped to the current site.
8. Added a Home-tab `Auto Cleanup` signal that surfaces the latest cosmetic cleanup result without opening Tools.
9. Added a local cosmetic cleanup summary map with the latest cleaned element hint so Home can explain what kind of shell was collapsed.
10. Expanded safe built-in cosmetic cleanup for leftover floating video-ad shells when the shell only contains ad-control text such as `Skip Ad`.
11. Added safety coverage so similarly named real content containers, such as `video-advice-card`, are not collapsed when they contain meaningful page text.
12. Made built-in cosmetic cleanup observe discovered open shadow roots so late ad shells inside shadow DOM widgets are cleaned after the initial page pass.
13. Added safe built-in Freestar cleanup for observed empty `.freestar-ad` leaderboard slots after blocked GPT/prebid delivery on `zerogpt.com`.
14. Added unit coverage proving an empty Freestar leaderboard slot and its ad-only wrapper collapse without needing a custom hiding rule.
15. Rebuilt `dist` and live-verified on `https://www.zerogpt.com/` that `zerogpt_leaderboard_top`, `zerogpt_leaderboard_btf`, and the top `leaderboard-video` wrapper are marked `data-zg-cosmetic-cleaned="1"` and hidden.
16. Tightened the built-in cosmetic cleanup observer so unrelated `class`/`id` and child-list mutations no longer trigger full-document cleanup scans.
17. Added unit coverage proving ordinary post/video-shell mutations do not rescan cleanup, while late ad-like subtrees still collapse.
18. Added Popup Guard for forced popup abuse:
   - blocks `window.open()` without a recent trusted gesture
   - injects a MAIN-world `page_popup_guard` content script into all frames, including about:blank/fallback frames, because third-party player scripts do not use the extension isolated world
   - blocks cross-site or blank popup attempts after ordinary non-link clicks and video/player-control clicks
   - blocks suspicious cross-site overlay anchors
   - allows same-site popups after normal trusted clicks
   - allows explicit link popups opened by the user
   - restores native `window.open` when protection is disabled
   - sends enable/disable state to the MAIN-world page guard so the injected frame blocker respects the normal protection lifecycle
19. Verified the built `dist` extension with a local two-origin Puppeteer harness that simulates a third-party player iframe:
   - MAIN-world `page_popup_guard` marker was present inside the iframe
   - cross-site `window.open()` from a trusted iframe click was blocked
   - same-site `window.open()` from a trusted iframe click was allowed
   - explicit `target=_blank` link navigation was allowed
   - suspicious cross-site player anchor navigation was blocked
   - page-world blocked events were recorded by the extension activity logger

Performance note:
- A user reported Chrome freezing briefly on a Reddit video thread. Automated headless Chromium received a Reddit 403 and could not exercise the real page, so no content/media inspection was performed. The code-side risk found was broad mutation-observer rescanning in cosmetic cleanup; that has been optimized and verified.
- Follow-up: the user clarified Reddit GIF-style media caused the freeze. Added a Reddit-only `RedditMediaGuard` content module that observes videos, pauses offscreen playback, does not resume manually paused videos, and observes late-inserted videos without scanning unrelated mutations.

Targets:
- empty ad boxes
- floating video ad containers
- sticky slide players
- leftover `Skip Ad` shells
- blank iframes after blocked ad scripts

Approach:
1. First confirm the network request is blocked.
2. Then add cosmetic cleanup only for the leftover shell.
3. Prefer site-specific cleanup when the pattern is risky.

## Work Track 5: Backup / Restore Follow-Up
Goal: make import/export safer over time.

Already done:
- Export/import works for persisted rules/settings that matter.
- Backup import now validates the wrapped backup schema version before importing. Future-version or missing-version wrapped backups fail clearly instead of being treated as legacy raw settings.
- Added unit coverage for future unsupported backup versions and missing backup schema versions.

Possible future improvement:
- Add concrete migration steps if/when backup schema version 2 is introduced.

Do not export:
- temporary wall fixes
- session allowlist
- caches
- tool history
- wall-assist traces

Those are not required to restore extension behavior.

## Work Track 6: Extension Observability
Goal: make runtime health and diagnostics obvious from Settings before opening DevTools.

Done:
1. Added a typed `ExtensionHealthSnapshot` settings model.
2. Added a settings loader that reads Chrome runtime/DNR/storage state and turns missing prerequisites into actionable health issues.
3. Added a Dashboard `Extension Health` card with static ruleset, dynamic rule, storage, pause, allowlist, disabled-site, version, and extension-ID details.
4. Added unit coverage for ready and attention health states.
5. Verified the packaged `dist` extension in a fresh Chrome profile and confirmed the health card reports ready with `core_protection`, `youtube_core`, 26 dynamic rules, initialized storage, and protection on.
6. Added a `Copy Diagnostics` action that copies a JSON runtime report from the health card.
7. Added unit coverage for the diagnostics report formatter.
8. Verified the packaged `dist` copy flow in a fresh Chrome profile, including the fallback copy path after direct clipboard writes were denied.
9. Added a `Download Diagnostics` action that saves the same JSON runtime report as `zenithguard_diagnostics.json`.
10. Added unit coverage for the diagnostics download helper.
11. Verified the packaged `dist` download flow in a fresh Chrome profile and confirmed the downloaded file contains the expected runtime health payload.
12. Added a reversible `Re-enable Protection` repair action that appears only when global protection is off.
13. Added unit coverage for the repair helper.
14. Verified the packaged `dist` repair flow in a fresh Chrome profile and confirmed storage, static rulesets, dynamic rules, and health status recover.
15. Added a reversible `Resume Protection` repair action that appears only when a temporary pause is active.
16. Added unit coverage for the resume repair helper.
17. Verified the packaged `dist` resume flow in a fresh Chrome profile and confirmed the pause marker, static rulesets, dynamic rules, and health status recover.
18. Added redacted active-tab context to copied/downloaded diagnostics reports.
19. Added unit coverage proving the diagnostics payload includes origin/domain context without leaking full path, query, or fragment details.
20. Added unit coverage proving the tab-context loader skips the extension Settings page and selects the most recent current-window web tab.
21. Verified the packaged `dist` copy flow in a fresh Chrome profile and confirmed the copied diagnostics JSON includes redacted recent-web-tab context from the real Chrome `tabs` API.
22. Added a visible `Diagnostics Site` preview row to the health card.
23. Added a visible `Refresh Health` action that reruns the same full settings/dashboard/health/site-context refresh path.
24. Verified the packaged `dist` Settings page in a fresh Chrome profile and confirmed the preview row, refresh action, and copied diagnostics context work together without leaking URL path/query/fragment details.
25. Added an `Open Logger` action to the health card that opens Logger for the diagnostics web tab with the redacted domain as initial search.
26. Added unit coverage for the Logger shortcut and the unavailable-tab error path.
27. Verified the packaged `dist` Settings page in a fresh Chrome profile and confirmed the Logger shortcut opens `src/pages/logger.html` with `tabId`, `search=example.com`, and `status=all` without leaking private URL path/query/fragment details.
28. Added an `Open Analyzer` action to the health card that opens Analyzer for the diagnostics web tab.
29. Added unit coverage for the Analyzer shortcut and the unavailable-tab error path.
30. Verified the packaged `dist` Settings page in a fresh Chrome profile and confirmed the Analyzer shortcut opens `src/pages/analyzer.html` with `tabId` only, without leaking private URL path/query/fragment details.
31. Added a diagnostics payload schema unit test that locks report sections and redaction behavior.
32. Added a compact `Diagnostics Preview` section to the Settings health card so users can see the health status, redacted site, enabled rulesets, protection state, and URL redaction summary before copying or downloading diagnostics.
33. Added unit coverage proving the diagnostics preview does not expose private URL path, query, or fragment details.
34. Added a diagnostics network-log summary to copied/downloaded Settings diagnostics and the visible preview. It reports only aggregate counts and timing, not request URLs.
35. Added unit coverage for network-log summary aggregation and the diagnostics report schema.
36. Fixed the popup loader for tab-hosted extension pages so it uses the most recent web tab instead of the popup/settings/logger tab as site context.
37. Added unit coverage for the popup web-tab fallback and reverified the packaged popup site-report e2e flow.
38. Added a direct `Open Logger Review` action to the popup Manual Report card so users can inspect reviewable allowed ad-tech/video-ad misses before copying a site report.
39. Reverified the packaged popup site-report e2e flow with the new pre-copy Logger Review action visible.
40. Added a visible review-candidate count to the popup Manual Report card, backed by the same candidate detector used by the copied site report.
41. Added unit coverage proving the candidate counter only includes allowed third-party ad-tech or video-ad signals, not first-party requests or already-blocked requests.
42. Added a compact, redacted review-candidate preview to the popup Manual Report card. It shows domain, request type, and reason only; full request URLs remain in Logger and the copied site report.
43. Added unit coverage proving the popup preview summaries do not leak request paths or query strings.
44. Added a compatibility guard to `scripts/check_dnr_rules.mjs` so broad payment/checkout filters cannot be added to `DEFAULT_BLOCKLIST` or `rules/core_protection.json` without failing `check:dnr` and `test:smoke`.
45. Added a TikTok compatibility guard to `scripts/check_dnr_rules.mjs` so broad TikTok app/CDN/media/login/security filters cannot be added to core blocking without failing `check:dnr` and `test:smoke`. This preserves the prior compatibility-first TikTok audit result while still allowing narrow telemetry filters.
46. Added packaged e2e coverage for the popup Manual Report card's direct pre-copy `Open Logger Review` action. The test confirms Logger opens with the original web tab ID, `status=allowed`, and `review=needs-review`.
47. Extended packaged popup site-report e2e coverage so the post-copy success-card `Open Logger Review` follow-up also opens Logger with the original tab ID, `status=allowed`, and `review=needs-review`.
48. Added a popup Manual Report `Copy Review List` action that copies a redacted candidate-only list for quick sharing. The list includes candidate domains, suggested domain filters, request types, and reasons, but excludes request paths and query strings.
49. Extended packaged popup site-report e2e coverage to verify `Copy Review List` is visible and disabled when no review candidates exist for the active tab.
50. Bumped ZenithGuard from `3.2.0` to `3.2.1` across package metadata, the extension manifest, Gemini client header, and What&apos;s New release copy.
51. Consolidated Logger and popup review-list copy output through `src/ui/shared/review_candidates.ts`. Logger keeps its broader uncovered third-party review scope, while both copied lists now use the same redacted candidate/domain/type/reason format.
52. Hardened `release.js` so Chrome-generated `_metadata` folders are ignored when packaging `dist`. Removed the generated `dist/_metadata`, reran `npm run check:dist`, temporarily recreated `releases/zenithguard-v3.2.1.zip`, verified the zip manifest was `3.2.1` with no `_metadata` entries, then removed the temporary zip because publishing is not planned right now.
53. Removed root recovery docs (`RECOVERY_INVENTORY.md`, `RECOVERY_STATUS.md`), refreshed `README.md` to describe the current `3.2.1` project instead of the old recovery workspace, and updated manifest-version test fixtures from `3.2.0` to `3.2.1`.
54. Updated `scripts/check_dist_surface.mjs` so Chrome-generated `dist/_metadata` is treated as an informational warning instead of a failure. Verified `npm run check:dist` passes both with and without `_metadata` present.
55. Added a per-row Logger `Copy domain filter` action for reviewable entries. It copies `||domain^` style filters, preserves already-decorated candidates, and shows a short copied state on the row.
56. Tightened Logger `Copy domain filter` copied-state tracking to use the copied row ID rather than the copied filter string, so duplicate-domain rows do not show false copied states.
57. Renamed `scripts/check_recovery_surface.mjs` to `scripts/check_extension_surface.mjs`, updated `npm run check:surface`, README, and the popup e2e describe text to remove stale recovery wording.
58. Replaced stale UI shell classes such as `recovery-settings-shell`, `recovery-logger-shell`, `recovery-analyzer-shell`, `recovery-whats-new-shell`, and `recovery-my-rules-shell` with `zg-*` names, and reworded two ambiguous recovery comments. Wall Recovery feature terms remain unchanged.
59. Removed stale recovered root build-artifact folders `assets/`, `js/`, and root `_metadata`. Verified they are regenerated or unnecessary under the current `dist` workflow: `npm run check:surface`, `npm run build`, `npm run test:smoke`, and `npm run check:dist` all pass. The packaged e2e flow recreated `dist/_metadata`, which remains expected Chrome unpacked-extension metadata.
60. Added a stale-root-artifact guard to `scripts/check_extension_surface.mjs` so `npm run check:surface` fails if root `assets/`, root `js/`, or root `_metadata` reappear. Verified the guard fails with a temporary root `assets/` directory, removed the temporary directory, then reverified `npm run check:surface`, `npm run build`, and `npm run test:smoke`.
61. Updated `README.md` to document the current generated-output rules: Chrome may create `dist/_metadata`, but root `assets/`, root `js/`, and root `_metadata` are stale artifacts and are blocked by `npm run check:surface`. Reverified `npm run check:surface`, `npm run check:dist`, `npm run build`, and `npm run test:smoke`.
62. Added Logger bulk filter copy support. The Logger header now exposes `Copy All Filters`, which copies deduped ABP-style domain filters for the currently visible reviewable rows. Added controller coverage proving the copied list dedupes duplicate domains and excludes paths/query strings. Verified with focused `tests/unit/logger_controller.test.ts`, `npx svelte-check`, `npm run build`, and `npm run test:smoke` (51 unit suites / 319 unit tests, 3 e2e suites / 4 e2e tests).
63. Updated the Logger bulk filter copy button to show the current visible unique filter count (`Copy 1 Filter`, `Copy 3 Filters`, `Copied 3 Filters`). Added unit coverage for the label helper and verified with focused `tests/unit/logger_controller.test.ts`, `npx svelte-check`, and `npm run build`.
64. Added Logger bulk custom-block support. The Logger header now exposes `Add X Filters` for the currently visible reviewable rows. The controller dedupes candidates, updates `networkBlocklist` and `networkBlocklistMeta` with `source: "logger"`, and sends a single `APPLY_ALL_RULES` message instead of applying per row. Added focused unit coverage for candidate collection, storage writes, metadata, labels, and single apply behavior. Verified with focused `tests/unit/logger_controller.test.ts`, `npx svelte-check`, and `npm run build`.
65. Added a lightweight confirmation step for Logger bulk custom-block adds. First click changes the label to `Confirm Add X Filters`; second click performs the storage write. Confirmation resets when the visible filter count changes or after a short timeout. Added label coverage for the confirming state and verified with focused `tests/unit/logger_controller.test.ts`, `npx svelte-check`, and `npm run build`.
66. Completed the Logger bulk-add workflow with visible success status and `Undo last add`. Bulk add now returns the newly-created filter values, the Logger table shows a success banner, and undo removes only those newly-created rules plus their Logger metadata before applying rules once. Added focused unit coverage for undo storage writes and single apply behavior. Verified with focused `tests/unit/logger_controller.test.ts` (29 tests), `npx svelte-check`, and `npm run build`.
67. Closed the Logger-to-Settings audit loop. Settings `My Rules -> Network Blocklist` now includes an origin dropdown (`All origins`, `Added from Logger`, `Added from Analyzer`, `Added from Inspector`, `Added in Settings`, `Added from Local AI`, `Unknown origin`). Network rule metadata display/filtering now uses hostname-aware lookup so `www`/apex variants still show the right origin and timestamp. Added focused unit coverage for metadata resolution and origin filtering. Verified with focused `tests/unit/rules_controller.test.ts` (13 tests), `npx svelte-check`, and `npm run build`.
68. Added packaged e2e coverage for the Logger-to-Settings workflow in `tests/e2e/logger_settings_workflow.test.ts`. The test loads built `dist`, opens Logger for a live web tab, seeds a reviewable allowed third-party Logger entry through the Logger page listener path, confirms `Add 1 Filter`, verifies `networkBlocklist` and `networkBlocklistMeta` store `ads.e2e.test` with `source: "logger"`, opens Settings `My Rules`, filters Network Blocklist to `Added from Logger`, verifies the rule is visible, then runs `Undo last add` and verifies storage cleanup. A first smoke run exposed that seeding through `chrome.runtime.sendMessage` was flaky for extension-page listeners; the test now dispatches through the Logger page listener path and is deterministic. Full smoke now passes: 51 unit suites / 325 unit tests and 4 e2e suites / 5 e2e tests.

Next steps:
1. Consider pausing observability work here and returning to manual site reports when the user provides a specific page.
2. Keep health checks read-only by default unless the user explicitly chooses a visible repair action.

## Recommended Next Task
Continue with `Work Track 6: Extension Observability`.

Reason:
- The user wants to pause broad live-site coverage and report future sites manually.
- The health card, diagnostics actions, reversible repair actions, redacted active-tab diagnostics context, diagnostics preview, site preview, manual refresh, Logger bridge, and Analyzer bridge are now in place.
- Keep live ad-site work targeted: only return to `Work Track 1` / `Work Track 4` when a specific page is reported or a manual session shows a visible issue.
- Observability is now in a good stopping state; the Logger review workflow is also easier to use for future user-reported sites.
- The next useful work is either another focused product improvement or a user-reported site. Do not keep expanding Settings observability unless there is a concrete diagnostic gap to close.

## Commands To Run Before Handing Back Work
- `npm run test:smoke`
- `npm run build`
- `npx svelte-check` if the task touches typed UI/source paths

If `svelte-check` fails again, treat it as a regression until the failing diagnostics are inspected.
