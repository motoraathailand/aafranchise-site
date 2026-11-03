// 2단계: 캐시된 상세 페이지 → web/data/brands.json (앱에 번들). 네트워크 사용 없음(fetch.mjs 가 받아 둔 원문만 읽음).
//  · 출처 추적: 브랜드마다 sources[] (URL·수집 시각·사이트의 "ข้อมูล ณ วันที่" 기준일). 값 객체에는 s(= sources 인덱스)가 붙음.
//  · 해석 못 한 값은 null — 추측하지 않음. 원문(raw)을 항상 같이 보관.
//  · meta.version 은 단조 증가하는 정수(원격 갱신 시 "더 크면 교체"에 사용).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDetail, decode } from './parse.mjs';
import { translateCategory } from './categories.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data/cache');
const argv = (n) => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : process.argv[i + 1]; };
const OUT = argv('out') ? resolve(process.cwd(), argv('out')) : join(ROOT, 'web/data/brands.json'); // --out <파일>: 다른 곳에 쓰기(주간 갱신은 검증 전 임시 파일에 먼저 씀)
const PREV = argv('prev') ? resolve(process.cwd(), argv('prev')) : null; // --prev <지난 brands.json>: 있으면 meta.version = max(오늘 날짜 정수, 지난 version + 1) — 항상 증가
const list = existsSync(join(CACHE, 'list.html')) ? readFileSync(join(CACHE, 'list.html'), 'utf8') : '';
const index = existsSync(join(CACHE, 'fetch-index.json')) ? JSON.parse(readFileSync(join(CACHE, 'fetch-index.json'), 'utf8')) : {};
const GROUPS = { '01food': 'food', '02beverage': 'beverage', '04service': 'service', '05education': 'education', '06beauty': 'beauty', '07store': 'store', '11etc': 'other' };
const fromList = new Map();
for (const m of list.matchAll(/detail\.php\?fcID=(f\d+)"[^>]*>\s*<img alt="([^"]*)" src="[^"]*franchisethai\/(\w+)\//g)) fromList.set(m[1], { name: decode(m[2]).trim(), group: GROUPS[m[3]] || 'other' });

const currentIds = existsSync(join(CACHE, 'thai-ids.json')) ? new Set(JSON.parse(readFileSync(join(CACHE, 'thai-ids.json'), 'utf8'))) : null; // 목록에서 사라진 브랜드의 옛 캐시는 제외
const files = readdirSync(join(CACHE, 'detail')).filter((f) => f.endsWith('.html') && (!currentIds || currentIds.has(f.replace('.html', '')))).sort();
const brands = []; const problems = []; let maxFetched = '';
for (const f of files) {
  const id = f.replace('.html', ''); const html = readFileSync(join(CACHE, 'detail', f), 'utf8');
  const L = fromList.get(id) || {}; const fetchedAt = index[id]?.fetchedAt || null; if (fetchedAt && fetchedAt > maxFetched) maxFetched = fetchedAt;
  let r; try { r = parseDetail(html, { id, url: `https://www.thaifranchisecenter.com/directory/detail.php?fcID=${id}`, fetchedAt, listName: L.name, group: L.group }); } catch (e) { problems.push(`${id}: parse error ${e.message}`); continue; }
  if (!r.name.th && !r.name.en) { problems.push(`${id}: no name`); continue; }
  if (r.country && !/thailand/i.test(r.country)) { problems.push(`${id}: country ${r.country} (skipped)`); continue; } // 태국 브랜드만
  const src = { id: 'tfc', site: 'ThaiFranchiseCenter', url: r.source.url, fetchedAt, asof: r.source.asof, asofRaw: r.source.asofRaw };
  const tag = (o) => (o ? { ...o, s: 0 } : null);
  const b = {
    id, name: { th: L.name && r.name.th !== L.name ? L.name : r.name.th, en: r.name.en }, group: L.group || 'other',
    category: r.category, // { th, subId }
    franchiseFee: tag(r.franchiseFee), totalInvestment: tag(r.totalInvestment), workingCapital: tag(r.workingCapital),
    royalty: tag(r.royalty), marketingFee: tag(r.marketingFee), deposit: tag(r.deposit), contract: tag(r.contract), payback: tag(r.payback),
    franchiseSinceYear: r.franchiseSinceYear, foundedYear: r.foundedYear, branches: r.branches, country: r.country || 'Thailand',
    description: r.description ? r.description.slice(0, 900) : null, products: r.products ? r.products.slice(0, 500) : null,
    requirements: r.requirements, support: r.support, highlights: r.highlights,
    contact: r.contact, sources: [src],
  };
  for (const k of Object.keys(b)) if (b[k] == null) delete b[k];
  if (b.franchiseFee && b.franchiseFee.min == null && !b.franchiseFee.raw) delete b.franchiseFee;
  brands.push(b);
}
// 이름이 og:title 과 목록이 다르면 목록 이름(브랜드 표시명)을 th 로 쓰되 중복 prefix 제거
for (const b of brands) { if (b.name.th) b.name.th = b.name.th.replace(/^แฟรนไชส์\s*/, '').trim(); }
const catTh = new Set(brands.map((b) => b.category && b.category.th).filter(Boolean));
const categories = {}; for (const th of catTh) { const tr = translateCategory(th); if (tr) categories[th] = tr; }
const asofs = brands.map((b) => b.sources[0].asof).filter(Boolean).sort();
const now = new Date();
const prevVersion = PREV && existsSync(PREV) ? Number(JSON.parse(readFileSync(PREV, 'utf8')).meta.version) || 0 : 0;
const stat = (fn) => brands.filter(fn).length;
const meta = {
  schema: 1, version: Math.max(Number(now.toISOString().slice(0, 10).replace(/-/g, '')), prevVersion + 1), generatedAt: now.toISOString(),
  scope: 'Thailand-based franchise brands listed on ThaiFranchiseCenter (foreign-origin brands are not included yet)',
  count: brands.length, totalThaiIdsListed: existsSync(join(CACHE, 'thai-ids.json')) ? JSON.parse(readFileSync(join(CACHE, 'thai-ids.json'), 'utf8')).length : null,
  sources: [{ id: 'tfc', name: 'ThaiFranchiseCenter', url: 'https://www.thaifranchisecenter.com/directory/', robots: 'respected (crawl delay ≥ 1.6 s, descriptive User-Agent)', scrapedUntil: maxFetched || null }],
  asofMin: asofs[0] || null, asofMax: asofs[asofs.length - 1] || null,
  coverage: { withTotalInvestment: stat((b) => b.totalInvestment?.min != null), withFranchiseFee: stat((b) => b.franchiseFee?.min != null), withRoyalty: stat((b) => b.royalty), withContract: stat((b) => b.contract), withPayback: stat((b) => b.payback), withBranches: stat((b) => b.branches != null) },
  note: 'All figures are as published by the brand/ThaiFranchiseCenter and may be outdated or promotional. Verify with the brand owner. Fields that could not be read are omitted (never guessed).',
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ meta, categories, brands }));
writeFileSync(join(CACHE, 'build-problems.log'), problems.join('\n'));
writeFileSync(join(CACHE, 'build-summary.json'), JSON.stringify({ brands: brands.length, problems: problems.length, filesRead: files.length }));
console.log('brands:', brands.length, '| problems:', problems.length, '| file KB:', Math.round(JSON.stringify({ meta, categories, brands }).length / 1024));
console.log(meta.coverage);
