// Git-tracked content (content/leaders.json, content/facts.json) <-> SQLite. Used by Docker (seed) and the static/Actions pipeline (export).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { db } from './db.js';
const C = path.join(path.dirname(fileURLToPath(import.meta.url)), '../content');
const LCOLS = ['province', 'role', 'name', 'source_url', 'source_name', 'verified_at', 'status', 'cand_name', 'cand_source_url', 'cand_fetched_at', 'cand_status', 'evidence', 'flag'];
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
