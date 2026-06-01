import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'db.sqlite')
  mkdirSync(path.dirname(dbPath), { recursive: true }) // ensure dir exists regardless of instrumentation timing
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

// ---- Types ----

export type UserRole = 'admin' | 'push' | 'viewer'

export interface User {
  id: number
  username: string
  password_hash: string
  role: UserRole
  created_at: string
  last_login: string | null
}

export interface AccessRule {
  id: number
  user_id: number
  repository: string
  actions: string
  created_at: string
}

export interface Token {
  id: number
  user_id: number
  name: string
  token_hash: string
  scope: string
  expires_at: string | null
  last_used: string | null
  created_at: string
}

export interface Event {
  id: number
  action: string
  repository: string
  tag: string | null
  digest: string | null
  actor: string | null
  ip: string | null
  size: number | null
  timestamp: string
  raw: string | null
}

export interface WebhookTarget {
  id: number
  name: string
  repository_pattern: string
  url: string
  secret: string | null
  events: string
  active: number
  created_at: string
  last_triggered: string | null
  last_status: number | null
}

export interface CleanupRule {
  id: number
  name: string
  repository_pattern: string
  keep_last_n: number | null
  max_age_days: number | null
  delete_untagged: number
  active: number
  created_at: string
  last_run: string | null
  last_deleted: number | null
}

// ---- Queries ----

export const db = {
  // Users
  users: {
    findAll: () => getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[],
    findById: (id: number) => getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined,
    findByUsername: (username: string) => getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined,
    create: (username: string, passwordHash: string, role: UserRole) =>
      getDb().prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role),
    update: (id: number, fields: Partial<Pick<User, 'password_hash' | 'role' | 'last_login'>>) => {
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(fields), id)
    },
    delete: (id: number) => getDb().prepare('DELETE FROM users WHERE id = ?').run(id),
  },

  // Access rules
  rules: {
    findByUser: (userId: number) =>
      getDb().prepare('SELECT * FROM access_rules WHERE user_id = ?').all(userId) as AccessRule[],
    create: (userId: number, repository: string, actions: string) =>
      getDb().prepare('INSERT INTO access_rules (user_id, repository, actions) VALUES (?, ?, ?)').run(userId, repository, actions),
    delete: (id: number) => getDb().prepare('DELETE FROM access_rules WHERE id = ?').run(id),
    deleteByUser: (userId: number) => getDb().prepare('DELETE FROM access_rules WHERE user_id = ?').run(userId),
  },

  // Events
  events: {
    findRecent: (limit = 50) =>
      getDb().prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?').all(limit) as Event[],
    findByRepo: (repository: string, limit = 50) =>
      getDb().prepare('SELECT * FROM events WHERE repository = ? ORDER BY timestamp DESC LIMIT ?').all(repository, limit) as Event[],
    search: (q: string, limit = 100) =>
      getDb().prepare(`SELECT * FROM events WHERE repository LIKE ? OR actor LIKE ? OR tag LIKE ? ORDER BY timestamp DESC LIMIT ?`)
        .all(`%${q}%`, `%${q}%`, `%${q}%`, limit) as Event[],
    insert: (e: Omit<Event, 'id'>) =>
      getDb().prepare('INSERT INTO events (action, repository, tag, digest, actor, ip, size, timestamp, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(e.action, e.repository, e.tag, e.digest, e.actor, e.ip, e.size, e.timestamp, e.raw),
    stats: () => getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'push' THEN 1 ELSE 0 END) as pushes,
        SUM(CASE WHEN action = 'pull' THEN 1 ELSE 0 END) as pulls,
        SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) as deletes
      FROM events
    `).get() as { total: number; pushes: number; pulls: number; deletes: number },
    last30Days: () => getDb().prepare(`
      SELECT date(timestamp) as day, COUNT(*) as count
      FROM events
      WHERE timestamp >= date('now', '-30 days')
      GROUP BY day
      ORDER BY day ASC
    `).all() as { day: string; count: number }[],
  },

  // Webhooks
  webhooks: {
    findAll: () => getDb().prepare('SELECT * FROM webhook_targets ORDER BY created_at DESC').all() as WebhookTarget[],
    findById: (id: number) => getDb().prepare('SELECT * FROM webhook_targets WHERE id = ?').get(id) as WebhookTarget | undefined,
    findActive: () => getDb().prepare('SELECT * FROM webhook_targets WHERE active = 1').all() as WebhookTarget[],
    create: (w: Omit<WebhookTarget, 'id' | 'created_at' | 'last_triggered' | 'last_status'>) =>
      getDb().prepare('INSERT INTO webhook_targets (name, repository_pattern, url, secret, events, active) VALUES (?, ?, ?, ?, ?, ?)')
        .run(w.name, w.repository_pattern, w.url, w.secret, w.events, w.active),
    update: (id: number, fields: Partial<WebhookTarget>) => {
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE webhook_targets SET ${sets} WHERE id = ?`).run(...Object.values(fields), id)
    },
    delete: (id: number) => getDb().prepare('DELETE FROM webhook_targets WHERE id = ?').run(id),
  },

  // Cleanup rules
  cleanup: {
    findAll: () => getDb().prepare('SELECT * FROM cleanup_rules ORDER BY created_at DESC').all() as CleanupRule[],
    findById: (id: number) => getDb().prepare('SELECT * FROM cleanup_rules WHERE id = ?').get(id) as CleanupRule | undefined,
    findActive: () => getDb().prepare('SELECT * FROM cleanup_rules WHERE active = 1').all() as CleanupRule[],
    create: (r: Omit<CleanupRule, 'id' | 'created_at' | 'last_run' | 'last_deleted'>) =>
      getDb().prepare('INSERT INTO cleanup_rules (name, repository_pattern, keep_last_n, max_age_days, delete_untagged, active) VALUES (?, ?, ?, ?, ?, ?)')
        .run(r.name, r.repository_pattern, r.keep_last_n, r.max_age_days, r.delete_untagged, r.active),
    update: (id: number, fields: Partial<CleanupRule>) => {
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE cleanup_rules SET ${sets} WHERE id = ?`).run(...Object.values(fields), id)
    },
    delete: (id: number) => getDb().prepare('DELETE FROM cleanup_rules WHERE id = ?').run(id),
  },

  // Settings
  settings: {
    get: (key: string) => (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value,
    set: (key: string, value: string) =>
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP')
        .run(key, value),
    all: () => getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[],
  },
}
