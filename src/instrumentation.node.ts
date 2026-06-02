// Node.js runtime only — bootstraps SQLite schema, seeds admin, starts cron jobs
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

const rawUrl = process.env.DATABASE_URL || ''
const isPostgres = rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://')

if (isPostgres) {
  console.log('[depot] Using PostgreSQL — run migrations manually with your preferred migration tool.')
  // PostgreSQL schema management is handled separately (pg_migrate, Flyway, etc.)
  // Seed logic below is skipped for Postgres; use your own seed script.
} else {

const dbPath = rawUrl || join(process.cwd(), 'data', 'db.sqlite')
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
    token_hash TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL DEFAULT 'pull',
    expires_at DATETIME,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    repository TEXT NOT NULL,
    tag TEXT, digest TEXT, actor TEXT, ip TEXT, size INTEGER,
    timestamp DATETIME NOT NULL, raw TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_repository ON events(repository);
  CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor);
  CREATE TABLE IF NOT EXISTS webhook_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repository_pattern TEXT NOT NULL DEFAULT '*',
    url TEXT NOT NULL, secret TEXT,
    events TEXT NOT NULL DEFAULT 'push,delete',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_triggered DATETIME, last_status INTEGER
  );
  CREATE TABLE IF NOT EXISTS cleanup_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    repository_pattern TEXT NOT NULL DEFAULT '*',
    keep_last_n INTEGER, max_age_days INTEGER,
    delete_untagged INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    schedule TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_run DATETIME, last_deleted INTEGER
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS group_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    repository TEXT NOT NULL DEFAULT '*',
    actions TEXT NOT NULL DEFAULT 'pull',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository TEXT NOT NULL, tag TEXT NOT NULL, digest TEXT NOT NULL,
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending',
    critical INTEGER NOT NULL DEFAULT 0, high INTEGER NOT NULL DEFAULT 0,
    medium INTEGER NOT NULL DEFAULT 0, low INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_scan_repo_tag ON scan_results(repository, tag);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL, action TEXT NOT NULL,
    target_type TEXT, target_id TEXT, detail TEXT, ip TEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
  CREATE TABLE IF NOT EXISTS sso_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, type TEXT NOT NULL,
    client_id TEXT NOT NULL, client_secret TEXT NOT NULL,
    issuer_url TEXT, authorization_url TEXT, token_url TEXT, userinfo_url TEXT,
    domain_whitelist TEXT, default_role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES sso_providers(id) ON DELETE CASCADE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS storage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository TEXT NOT NULL,
    registry_type TEXT NOT NULL DEFAULT 'docker',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    blob_count INTEGER NOT NULL DEFAULT 0,
    snapshotted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_storage_repo ON storage_snapshots(repository, registry_type);
`)

// ALTER TABLE guards — SQLite doesn't support IF NOT EXISTS on ALTER
function addCol(table: string, col: string, def: string) {
  const cols = (db.pragma(`table_info(${table})`) as {name:string}[]).map(c => c.name)
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
}
addCol('users', 'totp_secret', 'TEXT')
addCol('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0')
addCol('cleanup_rules', 'schedule', 'TEXT')
addCol('tokens', 'token_hash', 'TEXT') // migration safety, column defined in CREATE above

// Seed first admin user
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername)
if (!existing) {
  let pw = process.env.ADMIN_PASSWORD
  const gen = !pw
  if (!pw) pw = process.env.NODE_ENV === 'development' ? 'admin' : randomPw()
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(adminUsername, bcrypt.hashSync(pw, 12), 'admin')
  console.log('\n========================================')
  console.log('  Depot — first boot')
  console.log(`  Username : ${adminUsername}`)
  console.log(`  Password : ${pw}${gen ? ' (generated)' : ''}`)
  if (gen && process.env.NODE_ENV !== 'development') console.log('  ⚠  Change after first login!')
  console.log('========================================\n')
}
db.close()

} // end of SQLite-only block

// --- Start cron jobs ---
import('node-cron').then(({ schedule }) => {
  const { runCleanup } = require('./lib/cleanup-runner') as typeof import('./lib/cleanup-runner')

  // Nightly cleanup — run all active rules that have no explicit schedule
  schedule('0 2 * * *', async () => {
    console.log('[cron] Running scheduled cleanup...')
    const result = await runCleanup()
    console.log(`[cron] Cleanup done — ${result.deleted} tags deleted`)
  })

  // Hourly storage snapshot (lightweight — just reads existing scan cache)
  schedule('30 * * * *', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/admin/storage?refresh=1`, {
        headers: { 'x-internal': 'cron' },
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
    } catch (e) { /* non-fatal */ }
  })

  console.log('[cron] Scheduled jobs registered')
}).catch(() => console.warn('[cron] node-cron unavailable'))

function randomPw(): string {
  // Use cryptographically secure random bytes
  const { randomBytes } = require('crypto') as typeof import('crypto')
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = randomBytes(24)
  return Array.from(bytes).map(b => charset[b % charset.length]).join('').slice(0, 16)
}
