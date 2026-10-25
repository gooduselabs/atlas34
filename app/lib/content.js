// Git-tracked content (content/leaders.json, content/facts.json) <-> SQLite. Used by Docker (seed) and the static/Actions pipeline (export).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { db } from './db.js';
const C = path.join(path.dirname(fileURLToPath(import.meta.url)), '../content');
const LCOLS = ['province', 'role', 'name', 'source_url', 'source_name', 'verified_at', 'status', 'cand_name', 'cand_source_url', 'cand_fetched_at', 'cand_status', 'evidence', 'flag', 'news'];
const FCOLS = ['province', 'kind', 'text', 'source_url', 'verified_at', 'status'];
export function seedFromContent(force = false) {
  if (!force && db.prepare('SELECT COUNT(*) n FROM leaders').get().n) return false;
  const L = JSON.parse(fs.readFileSync(path.join(C, 'leaders.json'))); const F = JSON.parse(fs.readFileSync(path.join(C, 'facts.json')));
  const il = db.prepare(`INSERT OR REPLACE INTO leaders(${LCOLS}) VALUES (${LCOLS.map(c => '@' + c)})`);
  const ifa = db.prepare(`INSERT INTO facts(${FCOLS}) VALUES (${FCOLS.map(c => '@' + c)})`);
  db.transaction(() => { if (force) db.exec('DELETE FROM leaders; DELETE FROM facts;');
    L.forEach(r => il.run(Object.fromEntries(LCOLS.map(c => [c, r[c] ?? null])))); F.forEach(r => ifa.run(Object.fromEntries(FCOLS.map(c => [c, r[c] ?? null])))); })();
  return true;
}
export function exportToContent() {
  const L = db.prepare(`SELECT ${LCOLS} FROM leaders ORDER BY province, role`).all();
  const F = db.prepare(`SELECT ${FCOLS} FROM facts ORDER BY province, kind, id`).all();
  fs.writeFileSync(path.join(C, 'leaders.json'), JSON.stringify(L, null, 1) + '\n'); fs.writeFileSync(path.join(C, 'facts.json'), JSON.stringify(F, null, 1) + '\n');
  return { leaders: L.length, facts: F.length };
}
// Existing DBs (Docker volume) are only seeded once; bring in newer news-verification results from content/ on start.
export function syncNewsFromContent() {
  const L = JSON.parse(fs.readFileSync(path.join(C, 'leaders.json'))); let n = 0;
  const get = db.prepare('SELECT news FROM leaders WHERE province=? AND role=?');
  const upd = db.prepare('UPDATE leaders SET news=@news, flag=COALESCE(@flag, flag), cand_name=@cand_name, cand_source_url=@cand_source_url, cand_fetched_at=@cand_fetched_at, cand_status=@cand_status WHERE province=@province AND role=@role');
  const nnews = db.prepare('UPDATE leaders SET news=@news, flag=CASE WHEN @flag IS NOT NULL THEN @flag ELSE flag END WHERE province=@province AND role=@role');
  db.transaction(() => { for (const r of L) { if (!r.news) continue; const cur = get.get(r.province, r.role); if (!cur) continue;
    const a = JSON.parse(r.news).checked_at || '', b = cur.news ? JSON.parse(cur.news).checked_at || '' : '';
    if (a <= b) continue; const st = JSON.parse(r.news).status; n++;
    if (st === 'updated') upd.run({ ...r, flag: r.flag }); else nnews.run({ province: r.province, role: r.role, news: r.news, flag: st === 'conflict' ? r.flag : null }); } })();
  return n;
}
