// ThaiFranchiseCenter 정중한 수집기 — 1단계: 목록(태국 브랜드 id) + 상세 페이지 원문 캐시.
//  · robots.txt 를 먼저 읽고, 허용되지 않은 주소는 요청하지 않음 · 요청 간격 기본 1.6초(+지터) · 식별 가능한 User-Agent · 429/5xx 는 지수 백오프 · 이미 받은 페이지는 건너뜀(이어받기)
//  · 태국 브랜드만(id 가 'f' + 숫자; 해외 'fw…' 는 제외).  사용: node scraper/fetch.mjs [--limit N] [--refresh] [--max-age-hours H] [--delay ms]
//  · --refresh = 캐시와 상관없이 전부 다시 받음. --max-age-hours H = H시간보다 오래된(또는 없는) 페이지만 다시 받음(주간 갱신용: 중간에 끊겨도 다시 실행하면 이어서 진행). 받기 실패 시 이전 원문·기록은 그대로 둠(오래된 채로).
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRobots } from './robots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data/cache'); const DETAIL = join(CACHE, 'detail');
mkdirSync(DETAIL, { recursive: true });
const BASE = 'https://www.thaifranchisecenter.com';
const UA = 'fr-franchise-app-research/0.1 (polite; 1 req/1.6s; respects robots.txt; contact motoraathailand@gmail.com)';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const DELAY = Number(arg('delay', 1600)), LIMIT = Number(arg('limit', 0)), REFRESH = !!arg('refresh', false), MAXAGE = Number(arg('max-age-hours', 0));
const fresh = (f, rec) => existsSync(f) && !REFRESH && (!MAXAGE || (rec && rec.fetchedAt && Date.now() - Date.parse(rec.fetchedAt) < MAXAGE * 3600e3));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + DELAY + Math.random() * 400 - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'th,en;q=0.8' }, signal: AbortSignal.timeout(90000) });
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * 2 ** attempt); continue; }
      if (!res.ok) return { status: res.status, text: '' };
      return { status: res.status, text: await res.text() };
    } catch (e) { await sleep(3000 * 2 ** attempt); }
  }
  return { status: 0, text: '' };
}
const robotsTxt = (await get(BASE + '/robots.txt')).text;
writeFileSync(join(CACHE, 'robots.txt'), robotsTxt);
const robots = parseRobots(robotsTxt);
const allowed = (u) => robots.allowed(u.replace(BASE, ''));
if (!allowed(BASE + '/directory/all.php')) throw new Error('robots.txt disallows /directory/all.php');

const listPath = join(CACHE, 'list.html'); let list;
const listFresh = existsSync(listPath) && !REFRESH && (!MAXAGE || Date.now() - statSync(listPath).mtimeMs < MAXAGE * 3600e3);
if (!listFresh) { const r = await get(BASE + '/directory/all.php'); if (!r.text) throw new Error('list fetch failed ' + r.status); writeFileSync(listPath, r.text); list = r.text; }
else list = readFileSync(listPath, 'utf8');
const ids = [...new Set([...list.matchAll(/detail\.php\?fcID=(f\d+)"/g)].map((m) => m[1]))]; // 태국 브랜드만
writeFileSync(join(CACHE, 'thai-ids.json'), JSON.stringify(ids));
console.log('thai ids:', ids.length, '| delay', DELAY, 'ms');
const index = existsSync(join(CACHE, 'fetch-index.json')) ? JSON.parse(readFileSync(join(CACHE, 'fetch-index.json'), 'utf8')) : {};
let n = 0, ok = 0, fail = 0, skipped = 0; const t0 = Date.now();
for (const id of ids) {
  if (LIMIT && n >= LIMIT) break;
  const file = join(DETAIL, id + '.html');
  if (fresh(file, index[id])) { skipped++; continue; }
  const url = `${BASE}/directory/detail.php?fcID=${id}`;
  if (!allowed(url)) { console.log('robots disallow', url); continue; }
  n++;
  const r = await get(url);
  if (r.text && r.status === 200) { writeFileSync(file, r.text); index[id] = { url, fetchedAt: new Date().toISOString(), bytes: r.text.length }; ok++; }
  else { fail++; index[id] = existsSync(file) && index[id] && index[id].fetchedAt ? { ...index[id], lastFailedAt: new Date().toISOString(), lastStatus: r.status } : { url, status: r.status, failedAt: new Date().toISOString() }; } // 실패해도 이전 원문이 있으면 그 기록(fetchedAt)을 보존
  if ((ok + fail) % 20 === 0) { writeFileSync(join(CACHE, 'fetch-index.json'), JSON.stringify(index)); console.log(`${ok + fail}/${ids.length - skipped} ok=${ok} fail=${fail} ${((Date.now() - t0) / 60000).toFixed(1)}min`); }
}
writeFileSync(join(CACHE, 'fetch-index.json'), JSON.stringify(index));
console.log('done: ok', ok, 'fail', fail, 'skipped(existing)', skipped);
if (!ok && !skipped && fail) process.exitCode = 1;
