// Weekly brand-data refresh for GitHub Actions (also runnable by hand: node tools/weekly-refresh.mjs [--force] [--dry-run]).
//  1) polite fresh scrape of ThaiFranchiseCenter (robots.txt first, 1.6 s + jitter between requests, identifying User-Agent, backoff; every page re-fetched, no cache is reused), one retry pass for pages that failed
//  2) rebuild brands.json in a temp file with meta.version = max(YYYYMMDD, previous + 1)
//  3) sanity checks (same validation the app applies + count/coverage/problem/stale limits); any failure => exit 1, nothing written
//  4) if content changed (fetch timestamps ignored) or --force: write docs/data/brands.json + docs/data/meta.json (new version). Otherwise only meta.json 'checkedAt' is refreshed (heartbeat; version unchanged). The workflow then commits and pushes.
// Writes GITHUB_OUTPUT (changed, heartbeat, version, count, checkedAt, message) and GITHUB_STEP_SUMMARY when present. Exit: 0 ok (changed or not) · 1 checks failed · 2 scrape failed.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { diffData, sanity, makeMeta } from './scraper/weekly-lib.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url)); const SITE = join(TOOLS, '..');
const CACHE = join(TOOLS, 'data/cache'); const NEXT = join(CACHE, 'next-brands.json'); const DOCS = join(SITE, 'docs/data');
const NOSCRAPE = process.argv.includes('--no-scrape'); // test only: reuse tools/data/cache as is
const FORCE = process.argv.includes('--force') || process.env.FORCE === 'true', DRY = process.argv.includes('--dry-run');
const t0 = Date.now(); const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const summaryMd = (md) => { console.log(md); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); };
const die = (code, msg) => { summaryMd(`### Weekly brand data refresh FAILED\n${msg}\n\nNothing was published.`); out('changed', 'false'); process.exit(code); };
const node = (args) => spawnSync(process.execPath, args, { cwd: TOOLS, stdio: 'inherit' });
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

if (!NOSCRAPE) { rmSync(join(CACHE, 'detail'), { recursive: true, force: true }); rmSync(join(CACHE, 'fetch-index.json'), { force: true }); rmSync(join(CACHE, 'list.html'), { force: true }); } // always a fresh fetch
mkdirSync(CACHE, { recursive: true });
const prevFile = join(DOCS, 'brands.json'); const prev = existsSync(prevFile) ? readJson(prevFile) : { meta: { version: 0 }, brands: [] };
console.log(`start ${new Date().toISOString()}; previous published: v${prev.meta.version}, ${prev.brands.length} brands`);
if (!NOSCRAPE && node(['scraper/fetch.mjs', '--refresh']).status !== 0) die(2, 'scraper/fetch.mjs failed (list page or too many request failures).');
if (!NOSCRAPE) node(['scraper/fetch.mjs', '--max-age-hours', '3']); // retry pass: only pages that failed/missing are fetched again (fresh ones are skipped)
const prevArg = existsSync(prevFile) ? ['--prev', prevFile] : [];
const b = node(['scraper/build-brands.mjs', '--out', NEXT, ...prevArg]); if (b.status !== 0) die(1, 'build-brands.mjs failed.');
const next = readJson(NEXT); const bs = readJson(join(CACHE, 'build-summary.json')); const ids = readJson(join(CACHE, 'thai-ids.json')); const idx = readJson(join(CACHE, 'fetch-index.json'));
const stale = ids.filter((id) => !(idx[id] && idx[id].fetchedAt && Date.now() - Date.parse(idx[id].fetchedAt) < 8 * 3600e3)).length;
const errs = sanity(prev, next, { problems: bs.problems, stale, total: ids.length });
if (errs.length) die(1, 'Sanity checks failed:\n' + errs.map((e) => '- ' + e).join('\n'));
const d = diffData(prev, next); const changed = d.any || FORCE;
const list = (a) => (a.length ? ` (${a.slice(0, 10).join(', ')}${a.length > 10 ? ', …' : ''})` : '');
summaryMd(`### Weekly brand data refresh\n- brands total: **${next.brands.length}** (was ${prev.brands.length})\n- added: ${d.added.length}${list(d.added)}\n- removed: ${d.removed.length}${list(d.removed)}\n- changed: ${d.changed.length}\n- version: ${prev.meta.version} → **${changed ? next.meta.version : prev.meta.version + ' (unchanged)'}**\n- as-of: ${next.meta.asofMin} ~ ${next.meta.asofMax}\n- pages not refreshed: ${stale}/${ids.length}; parse problems: ${bs.problems}\n- published: **${changed && !DRY ? 'yes' : 'no'}**${!d.any && FORCE ? ' (forced; no content change)' : ''}\n- runtime: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
const checkedAt = new Date().toISOString(); const metaFile = join(DOCS, 'meta.json');
if (!changed || DRY) {
  out('changed', 'false');
  if (!DRY) { // heartbeat: only meta.json 'checkedAt' changes (keeps the repo active so GitHub does not disable the schedule); version/count/sha256 stay, so apps do not re-download
    const ptext = existsSync(prevFile) ? readFileSync(prevFile, 'utf8') : null; if (!ptext) process.exit(0);
    const old = existsSync(metaFile) ? readJson(metaFile) : makeMeta(prev, ptext);
    writeFileSync(metaFile, JSON.stringify({ ...old, checkedAt }, null, 1) + '\n');
    out('heartbeat', 'true'); out('version', old.version); out('count', old.count); out('checkedAt', checkedAt);
    out('message', `Weekly check OK, brand data unchanged (v${old.version}, ${old.count} brands): heartbeat ${checkedAt.slice(0, 10)}`);
  }
  process.exit(0);
}
const text = readFileSync(NEXT, 'utf8'); mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, 'brands.json'), text); writeFileSync(metaFile, JSON.stringify(makeMeta(next, text, checkedAt), null, 1) + '\n');
out('changed', 'true'); out('heartbeat', 'true'); out('version', next.meta.version); out('count', next.brands.length); out('checkedAt', checkedAt);
out('message', `Brand data v${next.meta.version}: ${next.brands.length} brands (+${d.added.length} -${d.removed.length} ~${d.changed.length}), as of ${next.meta.asofMax}`);
