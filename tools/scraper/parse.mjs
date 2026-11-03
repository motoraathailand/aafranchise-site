// ThaiFranchiseCenter 상세 페이지 → 구조화 레코드. 필드마다 원문(raw)과 출처(source_url)·기준일(asof)을 함께 보관한다.
// 파서는 순수 함수(입력: HTML 문자열) → 테스트 가능. 값이 없거나 해석 불가면 null (추측 금지).
const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
export const decode = (s) => String(s || '').replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const strip = (s) => decode(String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr|td|th|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
const oneLine = (s) => strip(s).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();

const THAI_MONTHS = { 'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12 };
export function beToCe(y) { y = +y; return y > 2400 ? y - 543 : y; }
export function parseThaiDate(s) { // "8 ตุลาคม 2569" → "2026-10-08"
  const m = String(s || '').match(/(\d{1,2})\s*(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})/);
  if (!m) return null; const y = beToCe(m[3]);
  return `${y}-${String(THAI_MONTHS[m[2]]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}
// "39,900 - 89,900 บาท", "6.2 ล้านบาท", "1-2 ล้านบาท", "ไม่ระบุ" → {min,max} (THB) | null
export function parseMoney(s) {
  const t = String(s || '').replace(/,/g, '');
  if (!/\d/.test(t) || /(ติดต่อ|ไม่ระบุ|ตามตกลง)/.test(t) && !/\d{3}/.test(t)) return null;
  const mult = /ล้าน/.test(t) ? 1e6 : /แสน/.test(t) ? 1e5 : /หมื่น/.test(t) ? 1e4 : /พัน/.test(t) ? 1e3 : 1;
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Math.round(parseFloat(m[0]) * mult));
  if (!nums.length) return null;
  const min = Math.min(nums[0], nums[1] ?? nums[0]), max = Math.max(nums[0], nums[1] ?? nums[0]);
  return { min, max };
}
export function parsePercentFee(s) { // "3% ต่อเดือน" / "ไม่มี" / "5% ของยอดขาย"
  const t = String(s || '').trim(); if (!t) return null;
  if (/^(ไม่มี|ไม่เก็บ|-|ไม่ม)/.test(t)) return { none: true, raw: t };
  const pm = t.match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*%/);
  const per = /ต่อเดือน|\/เดือน/.test(t) ? 'month' : /ต่อปี/.test(t) ? 'year' : /ยอดขาย|ของรายได้/.test(t) ? 'sales' : null;
  if (pm) return { pct: parseFloat(pm[1]), pctMax: pm[2] ? parseFloat(pm[2]) : null, per, raw: t };
  const money = parseMoney(t); if (money) return { amount: money, per, raw: t };
  return { raw: t };
}
export function parseDuration(s) { // "3-6 เดือน", "2 ปี" → months {min,max}
  const t = String(s || ''); const m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|ถึง)?\s*(\d+(?:\.\d+)?)?\s*(ปี|เดือน|วัน|อาทิตย์|สัปดาห์)/);
  if (!m) return null; const u = m[3] === 'ปี' ? 12 : m[3] === 'วัน' ? 1 / 30 : (m[3] === 'อาทิตย์' || m[3] === 'สัปดาห์') ? 7 / 30 : 1; let a = +m[1] * u, b = (m[2] ? +m[2] : +m[1]) * u;
  if (/ไม่เกิน/.test(t) && !m[2]) a = 0; // "ไม่เกิน N" = at most N
  return { min: Math.round(Math.min(a, b) * 10) / 10, max: Math.round(Math.max(a, b) * 10) / 10 };
}

const LABELS = {
  'ลักษณะกิจการ': 'type', 'ค่าแฟรนไชส์': 'franchiseFee', 'ระยะเวลาสัญญา': 'contract', 'งบการลงทุน': 'totalInvestment',
  'เงินทุนหมุนเวียน': 'workingCapital', 'ค่ารอยัลตี้ฟีส์': 'royalty', 'ค่ามาร์เก็ตติ้งฟีส์': 'marketingFee', 'เงินประกัน': 'deposit',
  'ระยะเวลาคืนทุน': 'payback', 'ปีที่ขายแฟรนไชส์': 'franchiseSince', 'ประเทศ': 'country', 'กลุ่มประเทศ': 'countryGroup',
};
export function parseRows(html) {
  const rows = {};
  for (const m of html.matchAll(/<div class='dv-main-show'>([\s\S]*?)<\/div>[\s\S]*?<td class='tb-over'>([\s\S]*?)<\/td>/g)) {
    const label = oneLine(m[1]); if (!rows[label]) rows[label] = { html: m[2], text: oneLine(m[2]) };
  }
  return rows;
}
const SECTION_HEADS = ['ความเป็นมา', 'สินค้าและบริการ', 'จำนวนสาขา', 'รวมสาขาทั้งหมด', 'ความพร้อมในการขยายสาขาไปต่างประเทศ', 'คุณสมบัติผู้ลงทุน', 'สิ่งที่ได้รับ', 'อื่นๆ', 'ติดต่อเจ้าของแฟรนไชส์'];
export function sectionize(html) {
  const start = html.indexOf("<div class='dv-main-show'>"); if (start < 0) return {};
  let body = html.slice(start);
  const stop = body.search(/รายชื่อผู้สนใจแฟรนไชส์|มีคนสนใจลงทุนแล้ว/); if (stop > 0) body = body.slice(0, stop);
  const lines = strip(body).split('\n').map((l) => l.trim()).filter(Boolean);
  const out = {}; let cur = null;
  for (const l of lines) { if (SECTION_HEADS.includes(l)) { cur = l; if (!out[cur]) out[cur] = []; continue; } if (cur) out[cur].push(l); }
  return out;
}
function contactOf(lines = []) {
  const kv = {}; let key = null; const KEYS = ['ชื่อบริษัท', 'ชื่อผู้บริหาร', 'ชื่อผู้ติดต่อ', 'ที่อยู่', 'โทรศัพท์', 'โทรสาร', 'มือถือ', 'อีเมล์', 'อีเมล', 'LINE', 'Instagram', 'Facebook', 'Youtube', 'Website', 'เว็บไซต์', 'TikTok'];
  for (const l of lines) { if (KEYS.includes(l)) { key = l; kv[key] = kv[key] || []; continue; } if (key) kv[key].push(l); }
  const phones = [...new Set([...(kv['มือถือ'] || []), ...(kv['โทรศัพท์'] || [])].map((p) => p.replace(/[^\d+\-\s()]/g, '').trim()).filter((p) => p.replace(/\D/g, '').length >= 8))];
  const emails = [...new Set([...(kv['อีเมล์'] || []), ...(kv['อีเมล'] || [])].filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  const link = (v) => { const x = (v || []).map((s) => s.trim()).find((s) => s && s !== '-'); return x || null; };
  return { company: link(kv['ชื่อบริษัท']), address: (kv['ที่อยู่'] || []).join(' ') || null, phones, emails, line: link(kv['LINE']), instagram: link(kv['Instagram']), facebook: link(kv['Facebook']), youtube: link(kv['Youtube']), website: link(kv['Website']) || link(kv['เว็บไซต์']) };
}
function metaContent(html, prop) { const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)); return m ? decode(m[1]).trim() : null; }
export function parseTitle(og) {
  if (!og) return {};
  const t = og.replace(/\s*by ThaiFranchiseCenter\.com\s*$/i, '').trim(); const parts = t.split('|').map((x) => x.trim()).filter(Boolean);
  const th = (parts[0] || '').replace(/^แฟรนไชส์\s*/, '').trim() || null;
  const en = (parts[1] || '').replace(/\s*franchise\s*$/i, '').trim() || null;
  return { th, en };
}
export function parseDetail(html, { id, url, fetchedAt, listName = null, group = null } = {}) {
  const rows = parseRows(html); const sec = sectionize(html); const val = (k) => rows[k]?.text ?? null;
  const asofRaw = decode((html.match(/ข้อมูล ณ วันที่((?:\s|&nbsp;)*[^<|]+)/) || [])[1] || '').replace(/\s+/g, ' ').trim() || null;
  const asof = parseThaiDate(asofRaw) || null;
  const titles = parseTitle(metaContent(html, 'og:title'));
  const image = metaContent(html, 'og:image');
  const typeLink = (rows['ลักษณะกิจการ']?.html.match(/SubId=(\d+)/) || [])[1] || null;
  const typeText = rows['ลักษณะกิจการ'] ? oneLine(rows['ลักษณะกิจการ'].html.split('|')[0].replace(/<a[^>]*>\s*แบบทดสอบ[\s\S]*$/, '')).replace(/\|.*$/, '').trim() : null;
  const since = val('ปีที่ขายแฟรนไชส์'); const sinceY = since ? (since.match(/\d{4}/) || [])[0] : null;
  const desc = strip((html.match(/<span itemprop='description'>([\s\S]*?)<\/span>/) || [])[1] || '');
  const founded = (strip((sec['ความเป็นมา'] || []).join('\n')).match(/(?:ก่อตั้ง[^\d\n]{0,25}|เมื่อ\s*ปี\s*|เมื่อ\s*พ\.ศ\.\s*|established[^\d]{0,15})(25\d{2}|19\d{2}|20\d{2})/i) || [])[1] || null;
  const branchTotal = (sec['จำนวนสาขา'] || []).join(' ').match(/รวมสาขาทั้งหมด\s*(\d[\d,]*)/);
  const f = (key, raw, parsed) => raw == null ? null : { raw, ...parsed };
  const rec = {
    id, name: { th: titles.th || listName, en: titles.en || null }, groupCode: group,
    category: { th: typeText ? typeText.replace(/^แฟรนไชส์\s*/, '') : null, subId: typeLink },
    franchiseFee: f('f', val('ค่าแฟรนไชส์'), parseMoney(val('ค่าแฟรนไชส์')) || {}),
    totalInvestment: f('f', val('งบการลงทุน'), parseMoney(val('งบการลงทุน')) || {}),
    workingCapital: f('f', val('เงินทุนหมุนเวียน'), { ...(parseMoney(val('เงินทุนหมุนเวียน')) || {}), per: /ต่อเดือน/.test(val('เงินทุนหมุนเวียน') || '') ? 'month' : null }),
    royalty: val('ค่ารอยัลตี้ฟีส์') == null ? null : parsePercentFee(val('ค่ารอยัลตี้ฟีส์')),
    marketingFee: val('ค่ามาร์เก็ตติ้งฟีส์') == null ? null : parsePercentFee(val('ค่ามาร์เก็ตติ้งฟีส์')),
    deposit: f('f', val('เงินประกัน'), parseMoney(val('เงินประกัน')) || {}),
    contract: val('ระยะเวลาสัญญา') == null ? null : { raw: val('ระยะเวลาสัญญา'), years: (() => { const d = parseDuration(val('ระยะเวลาสัญญา')); return d ? { min: Math.round(d.min / 12 * 10) / 10, max: Math.round(d.max / 12 * 10) / 10 } : null; })() },
    payback: val('ระยะเวลาคืนทุน') == null ? null : { raw: val('ระยะเวลาคืนทุน'), months: parseDuration(val('ระยะเวลาคืนทุน')) },
    franchiseSinceYear: sinceY ? beToCe(sinceY) : null,
    foundedYear: founded ? beToCe(founded) : null,
    country: (val('ประเทศ') || '').split('|')[0].trim() || null,
    branches: branchTotal ? +branchTotal[1].replace(/,/g, '') : null,
    description: desc || null,
    products: strip((sec['สินค้าและบริการ'] || []).join('\n')) || null,
    requirements: (sec['คุณสมบัติผู้ลงทุน'] || []).slice(0, 12),
    support: (sec['สิ่งที่ได้รับ'] || []).slice(0, 14),
    highlights: (sec['อื่นๆ'] || []).slice(0, 8),
    contact: contactOf(sec['ติดต่อเจ้าของแฟรนไชส์']),
    image,
    source: { url, fetchedAt, asof, asofRaw, site: 'ThaiFranchiseCenter' },
  };
  return rec;
}
