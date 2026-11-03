// 원격 브랜드 데이터 검증(순수 함수, 의존성 없음). 앱(web/data.js)과 주간 갱신 도구(scraper/weekly-lib.mjs, 사이트 저장소 tools/ 복사본)가 같은 규칙을 씀.
export const MAX_DROP = 0.15; // 새 데이터의 브랜드 수가 지금 것보다 15% 넘게 줄면 거부
export const GROUPS = ['food', 'beverage', 'education', 'service', 'store', 'beauty', 'other'];
// 원격 데이터 검증: 스키마 · 버전이 더 큼 · 브랜드 수 정상 범위 · 필수 필드 · 금액 정보가 한꺼번에 비어 있지 않음. 문제가 있으면 { ok:false, reason }.
export function validateData(j, cur = { meta: {}, brands: [] }) {
  const bad = (reason) => ({ ok: false, reason });
  if (!j || typeof j !== 'object' || !j.meta || typeof j.meta !== 'object' || !Array.isArray(j.brands)) return bad('shape');
  if (j.meta.schema !== 1) return bad('schema');
  const v = j.meta.version, cv = (cur && cur.meta && cur.meta.version) || 0;
  if (!Number.isInteger(v) || v <= cv) return bad('not-newer');
  const n = j.brands.length, cn = (cur && cur.brands && cur.brands.length) || 0;
  if (n < 100 || n < cn * (1 - MAX_DROP)) return bad('count');
  if (j.meta.count != null && j.meta.count !== n) return bad('meta-count');
  const seen = new Set(); let money = 0;
  for (const b of j.brands) {
    if (!b || typeof b.id !== 'string' || !/^f\d+$/.test(b.id) || seen.has(b.id) || !b.name || typeof b.name !== 'object' || !(b.name.th || b.name.en) || !GROUPS.includes(b.group)) return bad('brand');
    seen.add(b.id); if ((b.totalInvestment && b.totalInvestment.min != null) || (b.franchiseFee && b.franchiseFee.min != null)) money++;
  }
  if (money < n * 0.5) return bad('empty-fees');
  return { ok: true };
}
