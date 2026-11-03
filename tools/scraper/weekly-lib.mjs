// 주간 갱신의 순수 함수들(네트워크·파일 없음 → 단위 테스트 가능): 변경 비교 · 건전성 검사 · meta.json 만들기.
import { createHash } from 'node:crypto';
import { validateData } from '../web/data-validate.js';

export const LIMITS = { maxDrop: 0.10, maxCoverageDrop: 0.15, maxProblemRate: 0.03, maxStaleRate: 0.03 };

// 매번 달라지는 값(수집 시각 등)을 뺀 브랜드 사본 — 내용이 실제로 바뀌었는지 비교용
export function normBrand(b) {
  const c = { ...b }; if (c.sources) c.sources = c.sources.map((s) => { const { fetchedAt, ...r } = s; return r; });
  return JSON.stringify(c);
}
export function diffData(prev, next) {
  const P = new Map((prev.brands || []).map((b) => [b.id, normBrand(b)])), N = new Map(next.brands.map((b) => [b.id, normBrand(b)]));
  const added = [...N.keys()].filter((id) => !P.has(id)), removed = [...P.keys()].filter((id) => !N.has(id));
  const changed = [...N.keys()].filter((id) => P.has(id) && P.get(id) !== N.get(id));
  const catChanged = JSON.stringify(prev.categories || {}) !== JSON.stringify(next.categories || {});
  return { added, removed, changed, categoriesChanged: catChanged, any: !!(added.length || removed.length || changed.length || catChanged) };
}
// 게시 전 검사. 문제 목록(빈 배열이면 통과). prev 가 비어 있으면(첫 게시) 감소 검사는 건너뜀.
export function sanity(prev, next, ctx = {}) {
  const errs = []; const L = { ...LIMITS, ...(ctx.limits || {}) };
  const pn = (prev && prev.brands && prev.brands.length) || 0, nn = (next && next.brands && next.brands.length) || 0;
  const v = validateData(next, { meta: { version: (prev && prev.meta && prev.meta.version) || 0 }, brands: prev && prev.brands ? prev.brands.slice(0, 0) : [] });
  if (!v.ok) errs.push('schema/validation failed: ' + v.reason);
  if (pn && nn < pn * (1 - L.maxDrop)) errs.push(`brand count dropped too much: ${pn} -> ${nn} (limit ${L.maxDrop * 100}%)`);
  if (pn && next.meta && prev.meta && next.meta.version <= prev.meta.version) errs.push('meta.version not increased');
  const cov = (d, k) => (d.meta && d.meta.coverage && d.meta.coverage[k]) || 0;
  if (pn) for (const k of ['withTotalInvestment', 'withFranchiseFee', 'withRoyalty', 'withContract', 'withBranches']) {
    if (cov(next, k) < cov(prev, k) * (1 - L.maxCoverageDrop)) errs.push(`coverage ${k} dropped: ${cov(prev, k)} -> ${cov(next, k)}`);
  }
  if (nn) { const empty = next.brands.filter((b) => !(b.franchiseFee && (b.franchiseFee.min != null || b.franchiseFee.raw)) && !(b.totalInvestment && b.totalInvestment.min != null)).length; if (empty > nn * 0.5) errs.push(`too many brands without any fee: ${empty}/${nn}`); }
  if (ctx.problems != null && nn && ctx.problems > (nn + ctx.problems) * L.maxProblemRate) errs.push(`too many parse problems: ${ctx.problems}`);
  if (ctx.stale != null && ctx.total && ctx.stale > ctx.total * L.maxStaleRate) errs.push(`scrape incomplete: ${ctx.stale}/${ctx.total} pages not refreshed (re-run the command to resume)`);
  if (prev && prev.meta && next.meta && prev.meta.asofMax && next.meta.asofMax && next.meta.asofMax < prev.meta.asofMax) errs.push(`asofMax went backwards: ${prev.meta.asofMax} -> ${next.meta.asofMax}`);
  return errs;
}
export function makeMeta(next, jsonText, checkedAt = null) {
  const m = next.meta;
  return { schema: 1, version: m.version, count: next.brands.length, generatedAt: m.generatedAt, asofMin: m.asofMin || null, asofMax: m.asofMax || null, bytes: Buffer.byteLength(jsonText), sha256: createHash('sha256').update(jsonText).digest('hex'), ...(checkedAt ? { checkedAt } : {}) }; // checkedAt = 마지막으로 점검한 시각(데이터가 안 바뀐 주에도 갱신되는 heartbeat; version 은 그대로)
}
