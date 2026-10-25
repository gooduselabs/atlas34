import Database from 'better-sqlite3';
import fs from 'node:fs'; import path from 'node:path';
const dir = process.env.DATA_DIR || path.resolve('var'); fs.mkdirSync(dir, { recursive: true });
export const db = new Database(path.join(dir, 'vnmap.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS leaders (province TEXT, role TEXT,
  name TEXT, source_url TEXT, source_name TEXT, verified_at TEXT, status TEXT,      -- published value
  cand_name TEXT, cand_source_url TEXT, cand_fetched_at TEXT, cand_status TEXT, evidence TEXT, flag TEXT,
  PRIMARY KEY (province, role));
CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY AUTOINCREMENT, province TEXT, kind TEXT, text TEXT,
  source_url TEXT, verified_at TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, finished_at TEXT, summary TEXT);
`);
