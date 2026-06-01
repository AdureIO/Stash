// Node.js runtime only — bootstraps SQLite schema and first admin user
// Only imported from instrumentation.ts when NEXT_RUNTIME === 'nodejs'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

const dbPath = process.env.DATABASE_URL || join(process.cwd(), 'data', 'db.sqlite')

mkdirSync(dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
  CREATE TABLE IF NOT EXISTS access_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL DEFAULT '*',
    actions TEXT NOT NULL DEFAULT 'pull',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'pull',
    expires_at DATETIME,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    repository TEXT NOT NULL,
    tag TEXT,
    digest TEXT,
    actor TEXT,
    ip TEXT,
    size INTEGER,
    timestamp DATETIME NOT NULL,
    raw TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_repository ON events(repository);
  CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor);
  CREATE TABLE IF NOT EXISTS webhook_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repository_pattern TEXT NOT NULL DEFAULT '*',
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL DEFAULT 'push,delete',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_triggered DATETIME,
    last_status INTEGER
  );
  CREATE TABLE IF NOT EXISTS cleanup_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repository_pattern TEXT NOT NULL DEFAULT '*',
    keep_last_n INTEGER,
    max_age_days INTEGER,
    delete_untagged INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_run DATETIME,
    last_deleted INTEGER
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

// Seed first admin user if none exists
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername)

if (!existing) {
  let adminPassword = process.env.ADMIN_PASSWORD
  const generated = !adminPassword
  if (!adminPassword) {
    adminPassword = process.env.NODE_ENV === 'development'
      ? 'admin'
      : randomPassword()
  }

  const hash = bcrypt.hashSync(adminPassword, 12)
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(adminUsername, hash, 'admin')

  console.log('\n========================================')
  console.log('  Registry Admin — first boot')
  console.log(`  Username : ${adminUsername}`)
  console.log(`  Password : ${adminPassword}${generated ? ' (generated)' : ''}`)
  if (generated && process.env.NODE_ENV !== 'development') {
    console.log('  ⚠  Change this password after first login!')
  }
  console.log('========================================\n')
}

db.close()

function randomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
