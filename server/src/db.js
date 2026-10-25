import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const serverFile = fileURLToPath(import.meta.url);
const serverDir = path.resolve(path.dirname(serverFile), '..');
dotenv.config({ path: path.join(serverDir, '.env') });

const configured = process.env.DATABASE_FILE || './data/smartflow.sqlite';
const dbPath = path.isAbsolute(configured) ? configured : path.resolve(serverDir, configured.replace(/^\.\//, ''));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE,
 phone TEXT UNIQUE,
 password_hash TEXT,
 account_type TEXT NOT NULL CHECK(account_type IN ('customer','employee')),
 role TEXT NOT NULL DEFAULT 'customer',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS records (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 module TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Open',
 location TEXT DEFAULT '',
 metadata TEXT DEFAULT '{}',
 owner_id INTEGER,
 updated_by INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_id) REFERENCES users(id),
 FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS records_module_idx ON records(module);
CREATE INDEX IF NOT EXISTS records_owner_idx ON records(owner_id);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_id INTEGER,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id INTEGER,
 details TEXT DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id) REFERENCES users(id)
);
`);
