// Verify provincial leaders against articles on xaydungchinhsach.chinhphu.vn (Báo điện tử Chính phủ — Xây dựng Chính sách, Pháp luật).
// Polite crawler: honest UA, robots.txt checked, >= 1.5 s between requests. Never invents names: every name/URL stored comes from an article title/sapo.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dir = path.dirname(fileURLToPath(import.meta.url));
export const SITE = 'https://xaydungchinhsach.chinhphu.vn', SITE_NAME = 'Xây dựng Chính sách, Pháp luật';
const UA = 'Atlas34-news-verify/1.0 (+https://github.com/gooduselabs/atlas34; leader fact-check, 1 req/1.5s)';
const GAP = +process.env.NEWS_GAP_MS || 1500; let last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  const w = last + GAP - Date.now(); if (w > 0) await sleep(w); last = Date.now();
  for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'vi' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; } return r.ok ? await r.text() : ''; } catch (e) { if (i === 2) throw e; await sleep(3000); } }
  return '';
}
const ent = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
// 1:1 character fold (same length as input) so regex indices on the folded text map back to the original
export const fold = s => [...s.normalize('NFC')].map(c => { const b = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); return c === 'đ' || c === 'Đ' ? 'd' : (b[0] || c); }).join('');
export function parseResults(html) {
  const out = []; const re = /data-linktype="newsdetail"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>([\s\S]*?)time-ago" title="([^"]+)"/g; let m;
  for (const blk of html.split('box-category-item').slice(1)) { re.lastIndex = 0; if (!(m = re.exec(blk))) continue;
    const sapo = (blk.match(/box-category-sapo">([^<]*)/) || [])[1] || '';
    const [mo, d, y] = m[4].split(' ')[0].split('/'); const [hh, mi] = m[4].split(' ')[1].split(':'); const pm = /PM/.test(m[4]);
    const date = `${y}-${mo}-${d}T${String((+hh % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${mi}:00+07:00`;
    out.push({ url: new URL(m[1], SITE).href, title: ent(m[2]).trim(), sapo: ent(sapo).replace(/^\(Chinhphu\.vn\)\s*-\s*/, '').trim(), date }); }
  return out;
}
export async function search(q, pages = 2) {
  const k = encodeURIComponent(q); const res = parseResults(await get(`${SITE}/tim-kiem.htm?keywords=${k}`));
  for (let p = 2; p <= pages; p++) res.push(...parseResults(await get(`${SITE}/timeline/search.htm?keywords=${k}&page=${p}`)));
  const seen = new Set(); return res.filter(r => !seen.has(r.url) && seen.add(r.url));
}
const short = full => full.replace(/^(Tỉnh|Thành phố)\s+/, '');
const provAlt = p => { const s = short(p.full); return s === 'Hồ Chí Minh' ? [s, 'TPHCM', 'TP.HCM', 'TP. HCM'] : [s]; };
const roleRe = (role, p) => { const pv = provAlt(p).map(x => fold(x).replace(/[.]/g, '\\.').replace(/ /g, '\\s*')).join('|');
  const r = role === 'bi_thu' ? `bi thu (?:tinh|thanh) uy` : `chu tich (?:ubnd|uy ban nhan dan)`;
  return new RegExp(`(?<!pho |nguyen |quyen pho )${r}\\s*(?:tinh |thanh pho |tp\\.? ?)?(?:${pv})(?![\\p{L}])`, 'gu'); };
const BAD = /thoi giu|thoi chuc|nghi huu|mien nhiem|cach chuc|tam dinh chi|ky luat|nguyen bi thu|nguyen chu tich/;
const APPT = /giu chuc|duoc bau|bau .{0,40}lam|chi dinh|phe chuan|giao quyen|bo nhiem|dieu dong|lam bi thu|lam chu tich|tieu su|nhan quyet dinh/;
const NAME = /(?:[Đđ]ồng chí|[Ôô]ng|[Bb]à)\s+((?:\p{Lu}\p{Ll}*\s+){1,4}\p{Lu}\p{Ll}*)/gu;
// people who hold `role` of province p according to one article (title + sapo); returns [{name, appt}]
export function holders(a, role, p) {
  const out = [];
  for (const seg of `${a.title}. ${a.sapo}`.split(/[;.]\s|\n/)) { const f = fold(seg); const rr = roleRe(role, p); let m;
    while ((m = rr.exec(f))) { const before = seg.slice(Math.max(0, m.index - 90), m.index); const fb = fold(before);
      if (BAD.test(fb.slice(-50))) continue;
      const ns = [...before.matchAll(NAME)]; const n = ns.at(-1); if (!n) continue;
      const tail = before.slice(n.index + n[0].length); if (/[,;]\s*(?:Phó|phó)|\bvà\b/.test(tail) && tail.length > 40) continue;
      // the role must belong to this person: only connector words between the name and the role
      if (!/^\s*(?:,|giữ chức|được bầu giữ chức|được bầu làm|làm|tân|-|–|được chỉ định|được phê chuẩn|được giao quyền|nhận quyết định)?\s*(?:giữ chức|làm|tân|nhiệm kỳ[^,]*,)?\s*$/i.test(tail)) continue;
      out.push({ name: n[1].trim(), appt: APPT.test(f) }); } }
  return out;
}
const same = (a, b) => fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim();
export async function verifyOne(p, role, name) {
  const q2 = role === 'bi_thu' ? `Bí thư ${/^Thành phố/.test(p.full) ? 'Thành ủy' : 'Tỉnh ủy'} ${short(p.full)}` : `Chủ tịch UBND ${/^Thành phố/.test(p.full) ? 'thành phố' : 'tỉnh'} ${short(p.full)}`;
  const arts = [...(name ? await search(name, 2) : []), ...await search(q2, 2)];
  const uniq = [...new Map(arts.map(a => [a.url, a])).values()].sort((a, b) => b.date.localeCompare(a.date));
  // the 34-province structure exists since 2025-07-01 (NQ 202/2025/QH15); older articles describe pre-merger units
  const SINCE = process.env.NEWS_SINCE || '2025-07-01';
  const hits = uniq.filter(a => a.date >= SINCE).flatMap(a => holders(a, role, p).map(h => ({ ...h, a })));
  const pick = a => ({ title: a.title, url: a.url, date: a.date.slice(0, 10), site: SITE_NAME });
  const confirm = name ? hits.find(h => same(h.name, name)) : null;
  const newer = hits.find(h => !(name && same(h.name, name)) && (!confirm || h.a.date > confirm.a.date));
  const now = new Date().toISOString();
  if (newer && newer.appt) return { status: 'updated', name: newer.name, prev_name: name || null, ...pick(newer.a), confirmed_prev: confirm ? pick(confirm.a) : null, checked_at: now, queries: [name, q2].filter(Boolean) };
  if (confirm && !newer) return { status: 'verified', name: confirm.name, ...pick(confirm.a), checked_at: now, queries: [name, q2] };
  if (newer) return { status: 'conflict', name: name || null, other: { name: newer.name, ...pick(newer.a) }, ...(confirm ? pick(confirm.a) : {}), checked_at: now, queries: [name, q2].filter(Boolean) };
  return { status: 'not_found', name: name || null, checked_at: now, queries: [name, q2].filter(Boolean) };
}
export async function robotsOk() { const t = await get(`${SITE}/robots.txt`); const blk = t.split(/User-agent:/i).find(b => /^\s*\*/.test(b)) || ''; return !/Disallow:\s*\/\s*$/m.test(blk) && !/Disallow:\s*\/(tim-kiem|timeline)/m.test(blk); }
// Apply to the leaders table: verified -> news source; updated -> new candidate (flag for admin approval, previous name noted); conflict -> flag only.
export async function verifyAll(db, log = console.log, only) {
  if (!await robotsOk()) throw new Error('robots.txt disallows search');
  const { provinces } = JSON.parse(fs.readFileSync(path.join(__dir, '../public/data/provinces.json'))); const sum = { checked: 0, verified: 0, updated: [], conflict: [], not_found: [], errors: [] };
  for (const p of provinces) for (const role of ['bi_thu', 'chu_tich']) { if (only && !only.includes(p.code)) continue;
    const l = db.prepare('SELECT * FROM leaders WHERE province=? AND role=?').get(p.code, role) || {}; const name = (l.status === 'approved' && l.name) || l.cand_name;
    try { const r = await verifyOne(p, role, name); sum.checked++;
      if (r.status === 'verified') { sum.verified++; db.prepare('UPDATE leaders SET news=? WHERE province=? AND role=?').run(JSON.stringify(r), p.code, role); }
      else if (r.status === 'updated') { sum.updated.push({ province: p.full, role, from: name, to: r.name, url: r.url, title: r.title, date: r.date });
        db.prepare(`INSERT INTO leaders(province, role) VALUES (?,?) ON CONFLICT DO NOTHING`).run(p.code, role);
        db.prepare("UPDATE leaders SET cand_name=?, cand_source_url=?, cand_fetched_at=?, cand_status='verified', news=?, flag='news_updated' WHERE province=? AND role=?").run(r.name, r.url, r.checked_at, JSON.stringify(r), p.code, role); }
      else if (r.status === 'conflict') { sum.conflict.push({ province: p.full, role, current: name, other: r.other.name, url: r.other.url, title: r.other.title, date: r.other.date });
        db.prepare("UPDATE leaders SET news=?, flag='news_conflict' WHERE province=? AND role=?").run(JSON.stringify(r), p.code, role); }
      else { sum.not_found.push({ province: p.full, role, name }); db.prepare('UPDATE leaders SET news=? WHERE province=? AND role=?').run(JSON.stringify(r), p.code, role); }
      log(`${p.code} ${role} ${r.status} ${r.name || ''} ${r.url || ''}`);
    } catch (e) { sum.errors.push(`${p.code}/${role}: ${e.message}`); log(`${p.code} ${role} ERROR ${e.message}`); } }
  return sum;
}
