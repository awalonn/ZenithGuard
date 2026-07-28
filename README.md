# ZenithGuard

ZenithGuard is an MV3 browser extension for ad blocking, privacy controls, page cleanup tools, request logging, and optional Gemini-assisted analysis.

Current version: `3.2.2`.

## Development
Use focused checks while iterating, then broader checks at meaningful checkpoints:
- `npm run check:types`
- `npm run test:smoke`
- `npm run build`
- `npm run check:surface`
- `npm run check:dist`

For small edits, run the focused unit or e2e test that covers the changed path first. Run `npm run check:types` when Svelte or typed UI/source paths change. Run `npm run build` for shipped code/assets. Save full `npm run test:smoke` for broad changes, release/handoff checkpoints, or when a focused check suggests wider risk.

The built `dist` directory loads in Chrome as an unpacked extension.
Chrome may create `dist/_metadata` while `dist` is loaded; that folder is local unpacked-extension metadata and is ignored by the dist checker and release packaging.

## Project Surface
- Source page entries live under `src/pages/*.html`
- Vite page build config: `vite.config.js`
- Vite script/content build config: `vite.content.config.js`
- Svelte workspace config: `svelte.config.js`
- Auxiliary script builds are orchestrated through `scripts/build_auxiliary_entries.mjs`
- Auxiliary entry definitions are centralized in `scripts/auxiliary_entries.mjs`
- Surface sanity-check: `scripts/check_extension_surface.mjs`
- Built-output sanity-check: `scripts/check_dist_surface.mjs`
- Release packaging entry point: `release.js`
- Firefox manifest helper: `scripts/build_firefox_manifest.cjs`
- Unit and packaged-extension e2e tests live under `tests/unit` and `tests/e2e`
- Jest is configured for ESM TypeScript
- `npm run test:smoke` begins with `npm run check:surface`
- Root `assets/`, `js/`, and `_metadata` are stale build/unpacked-extension artifacts, not source inputs. `npm run check:surface` fails if they reappear.

## Current Priorities
1. Keep packaged-extension behavior verified with `dist` e2e coverage.
2. Keep manual site-report and Logger Review flows useful for user-reported pages.
3. Harden compatibility-sensitive rules so broad filters do not break payment, login, media, or app surfaces.
4. Keep diagnostics and release metadata aligned with the actual extension state.
