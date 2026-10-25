// Leadership + summary pipeline. Sources: vi.wikipedia.org infobox (chủ tịch UBND, bí thư), Wikidata P6 (head of government),
// provincial portal (Wikidata P856) text match for cross-check. Never invents names: only stores strings parsed from sources.
import { db } from './db.js';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dir = path.dirname(fileURLToPath(import.meta.url));
const UA = 'VNMapAtlas/1.0 (self-hosted research site; contact: admin)';
const nfc = s => (s || '').normalize('NFC');
const fold = s => nfc(s).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
async function get(url, json = true, timeout = 20000, tries = 5) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
  if ((r.status === 429 || r.status >= 500) && tries > 1) { const wait = (+r.headers.get('retry-after') || 0) * 1000 || (6 - tries) * 8000; await new Promise(z => setTimeout(z, wait)); return get(url, json, timeout, tries - 1); }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return json ? r.json() : r.text();
}
const WP = 'https://vi.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1&';
function cleanWiki(v) {
  if (!v) return null;
  v = v.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[^}]*\}\}/g, '');
  v = v.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').replace(/<br\s*\/?>/g, ' ').trim();
  return v && v.length < 60 ? nfc(v) : null;
}
async function wikiPage(p) {
  for (const t of [p.full, p.name, `${p.name} (tỉnh)`]) {
    try {
      const d = await get(WP + new URLSearchParams({ action: 'parse', page: t, prop: 'wikitext', section: '0' }));
      const w = d.parse?.wikitext || '';
      if (/chủ tịch UBND|bí thư/i.test(w)) return { title: d.parse.title, wikitext: w };
    } catch {}
  }
  return null;
}
const infobox = (w, key) => { const m = w.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n]*)`, 'i')); return m ? cleanWiki(m[1]) : null; };
async function wikidata(title) {
  const d = await get(WP + new URLSearchParams({ action: 'query', prop: 'pageprops|extracts', titles: title, exintro: '1', explaintext: '1', exsentences: '3' }));
  const pg = d.query.pages[0]; const qid = pg.pageprops?.wikibase_item;
  let head = null, site = null;
  if (qid) {
    const e = (await get(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`)).entities[qid];
    site = e.claims.P856?.[0]?.mainsnak?.datavalue?.value || null;
    const cur = (e.claims.P6 || []).filter(c => !c.qualifiers?.P582 && c.rank !== 'deprecated');
    if (cur.length) {
      const hid = cur.at(-1).mainsnak.datavalue.value.id;
      const he = (await get(`https://www.wikidata.org/wiki/Special:EntityData/${hid}.json`)).entities[hid];
      head = nfc(he.labels.vi?.value || he.labels.en?.value || '');
    }
  }
  return { qid, head, site, extract: nfc(pg.extract || '') };
}
import https from 'node:https'; import http from 'node:http';
// Read-only HTML fetch for portal cross-check. Many *.gov.vn portals serve incomplete TLS chains, so cert errors are tolerated here (text match only, nothing sent).
function rawGet(url, hops = 4) {
  return new Promise((res, rej) => {
    const m = url.startsWith('https') ? https : http;
    const rq = m.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 ' + UA }, rejectUnauthorized: false, timeout: 15000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops) { r.resume(); return res(rawGet(new URL(r.headers.location, url).href, hops - 1)); }
      let b = ''; r.setEncoding('utf8'); r.on('data', c => { if (b.length < 3e6) b += c; }); r.on('end', () => res(b));
    });
    rq.on('timeout', () => rq.destroy(new Error('timeout'))); rq.on('error', rej);
  });
}
async function portalText(site) {
  if (!site) return null;
  try { const h = await rawGet(site); return fold(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')); } catch { return null; }
}
export async function refreshAll(log = console.log) {
  const { provinces } = JSON.parse(fs.readFileSync(path.join(__dir, '../public/data/provinces.json')));
  const now = new Date().toISOString(); const run = db.prepare('INSERT INTO runs(started_at) VALUES (?)').run(now).lastInsertRowid;
  const sum = { provinces: 0, found: 0, verified: 0, flagged: 0, errors: [] };
  const up = db.prepare(`INSERT INTO leaders(province, role, cand_name, cand_source_url, cand_fetched_at, cand_status, evidence, flag)
    VALUES (@province,@role,@name,@url,@at,@status,@ev,@flag)
    ON CONFLICT(province, role) DO UPDATE SET cand_name=@name, cand_source_url=@url, cand_fetched_at=@at, cand_status=@status, evidence=@ev,
      flag=CASE WHEN leaders.name IS NOT NULL AND leaders.name <> @name THEN 'changed' ELSE @flag END`);
  for (const p of provinces) {
    try {
      const wp = await wikiPage(p); await new Promise(r => setTimeout(r, 1200)); if (!wp) { sum.errors.push(`${p.name}: no wiki page`); continue; }
      sum.provinces++;
      const wd = await wikidata(wp.title); const portal = await portalText(wd.site);
      const wurl = `https://vi.wikipedia.org/wiki/${encodeURIComponent(wp.title.replace(/ /g, '_'))}`;
      for (const [role, key] of [['chu_tich', 'chủ tịch UBND'], ['bi_thu', 'bí thư']]) {
        const name = infobox(wp.wikitext, key); if (!name) continue; sum.found++;
        const ev = { wikipedia: { url: wurl, value: name } };
        let status = 'unverified', flag = null;
        if (role === 'chu_tich' && wd.head) { ev.wikidata = { url: `https://www.wikidata.org/wiki/${wd.qid}`, value: wd.head };
          if (fold(wd.head) !== fold(name)) { flag = 'conflict'; } }
        if (wd.site) ev.portal = { url: wd.site, found: portal ? portal.includes(fold(name)) : null };
        if (ev.portal?.found) { status = 'verified'; if (flag === 'conflict') flag = 'wikidata_stale'; }
        if (status === 'verified') sum.verified++; if (flag === 'conflict') sum.flagged++;
        up.run({ province: p.code, role, name, url: wurl, at: now, status, ev: JSON.stringify(ev), flag });
      }
      // auto summary fact from Wikipedia lead
      if (wd.extract) {
        const ex = db.prepare("SELECT id FROM facts WHERE province=? AND kind='summary' AND status='auto'").get(p.code);
        if (ex) db.prepare('UPDATE facts SET text=?, source_url=?, verified_at=? WHERE id=?').run(wd.extract, wurl, now, ex.id);
        else db.prepare("INSERT INTO facts(province,kind,text,source_url,verified_at,status) VALUES (?,?,?,?,?,'auto')").run(p.code, 'summary', wd.extract, wurl, now);
      }
      log(`✓ ${p.name}`);
    } catch (e) { sum.errors.push(`${p.name}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 2000));
  }
  db.prepare('UPDATE runs SET finished_at=?, summary=? WHERE id=?').run(new Date().toISOString(), JSON.stringify(sum), run);
  return sum;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) refreshAll().then(s => console.log(JSON.stringify(s)));
