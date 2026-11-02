# AA Franchise – intro, tester-join and privacy site

Static site (no dependencies) for the Android app **AA Franchise – เปิดร้านดี** (`com.motoraa.aafranchise`), published with GitHub Pages from `docs/` on `main`:

- Intro: https://motoraathailand.github.io/aafranchise-site/
- Tester join: https://motoraathailand.github.io/aafranchise-site/join.html
- Privacy policy: https://motoraathailand.github.io/aafranchise-site/privacy.html
- Account / data deletion: https://motoraathailand.github.io/aafranchise-site/delete.html
- App remote config (notices, update check): https://motoraathailand.github.io/aafranchise-site/app/version.json

Five languages (th, en, ko, zh, hi); the promo video and its text are Thai only.

## Edit and publish
1. Links and facts live in `config/site.json` (single source). Text lives in `src/strings.mjs` and `src/content.mjs`.
2. `node scripts/build.mjs` regenerates `docs/` from `src/`.
3. `node tests/site.test.mjs` (needs playwright-core + google-chrome).
4. Commit and push `main`; Pages redeploys in about a minute.

## Switches
- `optInLive` in `config/site.json`: set `true` once the Play closed test is published, so steps 3-4 on the join page become real links.
- `src/app/version.json`: `latestVersionCode` / `notices` read by the app (update popup and notices). Bump `latestVersionCode` after each Play release.

See `LICENSES.md` for fonts and assets.
