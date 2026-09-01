# Chrome Web Store screenshots

Upload the five PNG files from `screenshots/` in filename order. Each image is a
1280 x 800, opaque, 24-bit PNG generated from the real packaged extension UI.

The `promo/` directory contains the matching store promotional artwork:

- `small-promo-tile-440x280.png`
- `marquee-promo-tile-1400x560.png`

To regenerate the set after a UI change:

```powershell
npm run build
npm run capture:store
```

The capture script creates a temporary Chrome profile, seeds demonstration data,
loads `dist/` as an unpacked extension, and writes raw captures plus finished store
artwork under this directory.
