# AA Franchise – intro, tester-join and privacy site

Static site (no dependencies) for the Android app **AA Franchise – เปิดร้านดี** (`com.motoraa.aafranchise`), published with GitHub Pages from `docs/` on `main`:

- Intro: https://motoraathailand.github.io/aafranchise-site/
- Tester join: https://motoraathailand.github.io/aafranchise-site/join.html
- Privacy policy: https://motoraathailand.github.io/aafranchise-site/privacy.html
- Account / data deletion: https://motoraathailand.github.io/aafranchise-site/delete.html
- App remote config (notices, update check): https://motoraathailand.github.io/aafranchise-site/app/version.json
- Brand data for the app (refreshed weekly): https://motoraathailand.github.io/aafranchise-site/data/brands.json (+ `data/meta.json`)

Five languages (th, en, ko, zh, hi); the promo video and its text are Thai only.

## Edit and publish
1. Links and facts live in `config/site.json` (single source). Text lives in `src/strings.mjs` and `src/content.mjs`.
2. `node scripts/build.mjs` regenerates `docs/` from `src/`.
3. `node tests/site.test.mjs` (needs playwright-core + google-chrome).
4. Commit and push `main`; Pages redeploys in about a minute.

## Weekly brand data (GitHub Actions, no bot needed)
`docs/data/brands.json` + `meta.json` are produced by `.github/workflows/weekly-data.yml`: every Monday 03:00 UTC (and on demand: Actions > *Weekly brand data refresh* > Run workflow; tick *force* to publish even if nothing changed). It runs `tools/weekly-refresh.mjs` (Node only, no dependencies): fresh polite scrape of ThaiFranchiseCenter (robots.txt, 1.6 s delay, identifying User-Agent; about 30 min, job limit 120 min), rebuild with `meta.version = max(YYYYMMDD, previous + 1)`, sanity checks (same validation the app applies, brand count not >10 % down, coverage not >15 % down, parse problems <=3 %, <=3 % pages missing, as-of not going backwards). If a check fails the job fails (GitHub emails the repo owner) and nothing is committed. If everything passes and the content changed, the job commits `docs/data` to `main` and then waits until the live URL serves the new version.
- `tools/scraper/*.mjs` and `tools/web/data-validate.js` are copies from the app repo (`bash scripts/sync-site-tools.sh` there); `tools/weekly-refresh.mjs` and the workflow live only here.
- `scripts/build.mjs` keeps `docs/data/` when it regenerates `docs/`.
- GitHub disables scheduled workflows after 60 days without repository activity; weeks without data changes add no commits, so re-enable it in the Actions tab if that ever happens (or run it by hand).

## Switches
- `optInLive` in `config/site.json`: set `true` once the Play closed test is published, so steps 3-4 on the join page become real links.
- `src/app/version.json`: `latestVersionCode` / `notices` read by the app (update popup and notices). Bump `latestVersionCode` after each Play release.

See `LICENSES.md` for fonts and assets.
