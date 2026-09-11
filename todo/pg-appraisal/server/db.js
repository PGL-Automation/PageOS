"use strict";
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "appraisal.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company_code TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  grade TEXT NOT NULL,
  tier INTEGER NOT NULL,
  dept TEXT NOT NULL,
  scope TEXT NOT NULL,
  level INTEGER NOT NULL,
  role_type TEXT NOT NULL,            -- employee | manager | hc
  manager_id TEXT,
  code_hash TEXT,                     -- bcrypt hash of access code
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | open | closed
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appraisals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  manager_id TEXT,
  department TEXT NOT NULL,
  grade TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  self_json TEXT NOT NULL DEFAULT '{}',
  agreed_json TEXT NOT NULL DEFAULT '{}',
  employee_comments TEXT DEFAULT '',
  manager_comments TEXT DEFAULT '',
  development_plan TEXT DEFAULT '',
  hc_comments TEXT DEFAULT '',
  updated_at TEXT,
  UNIQUE (cycle_id, employee_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appraisals_cycle ON appraisals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_manager ON appraisals(manager_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// migration: add H2 target-setting phase to cycles (idempotent)
try { const cols = db.prepare("PRAGMA table_info(cycles)").all().map((c) => c.name); if (!cols.includes("phase")) db.exec("ALTER TABLE cycles ADD COLUMN phase TEXT DEFAULT 'appraisal'"); } catch (e) {}

const getSetting = (k) => { const r = db.prepare("SELECT value FROM settings WHERE key=?").get(k); return r ? r.value : null; };const setSetting = (k, v) => db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, String(v));

function audit(actorId, action, target, detail) {
  db.prepare("INSERT INTO audit(ts,actor_id,action,target,detail) VALUES(?,?,?,?,?)")
    .run(new Date().toISOString(), actorId || null, action, target || null, detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : null);
}

module.exports = { db, DB_PATH, getSetting, setSetting, audit };
