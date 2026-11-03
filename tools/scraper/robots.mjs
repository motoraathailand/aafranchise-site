// 최소 robots.txt 해석기: User-agent: * 그룹의 Allow/Disallow(와일드카드 * 와 $ 지원). 가장 긴 규칙이 이김(Google 방식).
export function parseRobots(text) {
  const rules = []; let applies = false, seenAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!seenAgent) applies = false; seenAgent = true; if (v === '*') applies = true; continue; }
    seenAgent = false;
    if (!applies) continue;
    if (k === 'disallow' && v) rules.push({ allow: false, pat: v });
    if (k === 'allow' && v) rules.push({ allow: true, pat: v });
  }
  const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  const compiled = rules.map((r) => ({ ...r, re: toRe(r.pat), len: r.pat.length }));
  return { rules, allowed(pathAndQuery) {
    let best = null;
    for (const r of compiled) { if (r.re.test(pathAndQuery) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r; }
    return !best || best.allow;
  } };
}
