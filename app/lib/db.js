import Database from 'better-sqlite3';
import fs from 'node:fs'; import path from 'node:path';
const dir = process.env.DATA_DIR || path.resolve('var'); fs.mkdirSync(dir, { recursive: true });
export const db = new Database(path.join(dir, 'vnmap.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS leaders (province TEXT, role TEXT,
  name TEXT, source_url TEXT, source_name TEXT, verified_at TEXT, status TEXT,      -- published value
  cand_name TEXT, cand_source_url TEXT, cand_fetched_at TEXT, cand_status TEXT, evidence TEXT, flag TEXT, news TEXT,
  PRIMARY KEY (province, role));
CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY AUTOINCREMENT, province TEXT, kind TEXT, text TEXT,
  source_url TEXT, verified_at TEXT, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, finished_at TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key_hash TEXT UNIQUE, prefix TEXT, owner TEXT, daily_limit INTEGER DEFAULT 10000,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, revoked_at TEXT, last_used_at TEXT, total INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS api_usage (day TEXT, who TEXT, n INTEGER DEFAULT 0, PRIMARY KEY (day, who));
`);
try { db.exec('ALTER TABLE leaders ADD COLUMN news TEXT'); } catch {} // migrate older DBs
