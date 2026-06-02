import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'

let _db: Database.Database | null = null

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgres://') || url.startsWith('postgresql://')
}

export function getDb(): Database.Database {
  if (isPostgres()) throw new Error('Use getPgPool() for PostgreSQL queries')
  if (_db) return _db
  const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'db.sqlite')
  mkdirSync(path.dirname(dbPath), { recursive: true })
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

export { isPostgres }

// ---- Types ----

export type UserRole = 'admin' | 'push' | 'viewer'

export interface User {
  id: number
  username: string
  password_hash: string
  role: UserRole
  created_at: string
  last_login: string | null
  totp_secret: string | null
  totp_enabled: number
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

export interface Group {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface GroupMember {
  group_id: number
  user_id: number
}

export interface GroupRule {
  id: number
  group_id: number
  repository: string
  actions: string
  created_at: string
}

export interface ScanResult {
  id: number
  repository: string
  tag: string
  digest: string
  scanned_at: string
  status: string
  critical: number
  high: number
  medium: number
  low: number
  raw_json: string | null
}

export interface AuditEntry {
  id: number
  actor: string
  action: string
  target_type: string | null
  target_id: string | null
  detail: string | null
  ip: string | null
  timestamp: string
}

export interface SsoProvider {
  id: number
  name: string
  type: string
  client_id: string
  client_secret: string
  issuer_url: string | null
  authorization_url: string | null
  token_url: string | null
  userinfo_url: string | null
  domain_whitelist: string | null
  default_role: string
  active: number
  created_at: string
}

export interface StorageSnapshot {
  id: number
  repository: string
  registry_type: string
  size_bytes: number
  blob_count: number
  snapshotted_at: string
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
    update: (id: number, fields: Partial<Pick<User, 'password_hash' | 'role' | 'last_login' | 'totp_secret' | 'totp_enabled'>>) => {
      const ALLOWED = new Set(['password_hash', 'role', 'last_login', 'totp_secret', 'totp_enabled'])
      const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.has(k)))
      if (!Object.keys(safe).length) return
      const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(safe), id)
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
      const ALLOWED = new Set(['name', 'repository_pattern', 'url', 'secret', 'events', 'active', 'last_triggered', 'last_status'])
      const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.has(k)))
      if (!Object.keys(safe).length) return
      const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE webhook_targets SET ${sets} WHERE id = ?`).run(...Object.values(safe), id)
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
      const ALLOWED = new Set(['name', 'repository_pattern', 'keep_last_n', 'max_age_days', 'delete_untagged', 'active', 'schedule', 'last_run', 'last_deleted'])
      const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.has(k)))
      if (!Object.keys(safe).length) return
      const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE cleanup_rules SET ${sets} WHERE id = ?`).run(...Object.values(safe), id)
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

  // PAT tokens
  tokens: {
    findByUser: (userId: number) =>
      getDb().prepare('SELECT id, user_id, name, scope, expires_at, last_used, created_at FROM tokens WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Omit<Token, 'token_hash'>[],
    findByHash: (hash: string) =>
      getDb().prepare('SELECT * FROM tokens WHERE token_hash = ?').get(hash) as Token | undefined,
    create: (userId: number, name: string, hash: string, scope: string, expiresAt?: string) =>
      getDb().prepare('INSERT INTO tokens (user_id, name, token_hash, scope, expires_at) VALUES (?, ?, ?, ?, ?)').run(userId, name, hash, scope, expiresAt ?? null),
    touch: (id: number) => getDb().prepare('UPDATE tokens SET last_used = ? WHERE id = ?').run(new Date().toISOString(), id),
    delete: (id: number, userId?: number) => {
      if (userId !== undefined) return getDb().prepare('DELETE FROM tokens WHERE id = ? AND user_id = ?').run(id, userId)
      return getDb().prepare('DELETE FROM tokens WHERE id = ?').run(id)
    },
  },

  // Groups
  groups: {
    findAll: () => getDb().prepare('SELECT * FROM groups ORDER BY name').all() as Group[],
    findById: (id: number) => getDb().prepare('SELECT * FROM groups WHERE id = ?').get(id) as Group | undefined,
    create: (name: string, description?: string) =>
      getDb().prepare('INSERT INTO groups (name, description) VALUES (?, ?)').run(name, description ?? null),
    update: (id: number, fields: Partial<Group>) => {
      const ALLOWED = new Set(['name', 'description'])
      const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.has(k)))
      if (!Object.keys(safe).length) return
      const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE groups SET ${sets} WHERE id = ?`).run(...Object.values(safe), id)
    },
    delete: (id: number) => getDb().prepare('DELETE FROM groups WHERE id = ?').run(id),
    members: (groupId: number) =>
      getDb().prepare('SELECT u.id, u.username, u.role FROM users u JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = ?').all(groupId) as Pick<User, 'id' | 'username' | 'role'>[],
    userGroups: (userId: number) =>
      getDb().prepare('SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?').all(userId) as Group[],
    addMember: (groupId: number, userId: number) =>
      getDb().prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId),
    removeMember: (groupId: number, userId: number) =>
      getDb().prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId),
    rules: (groupId: number) =>
      getDb().prepare('SELECT * FROM group_rules WHERE group_id = ? ORDER BY created_at').all(groupId) as GroupRule[],
    addRule: (groupId: number, repository: string, actions: string) =>
      getDb().prepare('INSERT INTO group_rules (group_id, repository, actions) VALUES (?, ?, ?)').run(groupId, repository, actions),
    deleteRule: (ruleId: number) => getDb().prepare('DELETE FROM group_rules WHERE id = ?').run(ruleId),
    allRulesForUser: (userId: number) =>
      getDb().prepare(`
        SELECT gr.repository, gr.actions FROM group_rules gr
        JOIN group_members gm ON gm.group_id = gr.group_id
        WHERE gm.user_id = ?
      `).all(userId) as Pick<GroupRule, 'repository' | 'actions'>[],
  },

  // Scan results
  scans: {
    findAll: () => getDb().prepare('SELECT id, repository, tag, digest, scanned_at, status, critical, high, medium, low FROM scan_results ORDER BY scanned_at DESC').all() as Omit<ScanResult, 'raw_json'>[],
    findByRepo: (repo: string, tag: string) =>
      getDb().prepare('SELECT * FROM scan_results WHERE repository = ? AND tag = ? ORDER BY scanned_at DESC LIMIT 1').get(repo, tag) as ScanResult | undefined,
    upsert: (r: Omit<ScanResult, 'id'>) =>
      getDb().prepare(`INSERT INTO scan_results (repository, tag, digest, scanned_at, status, critical, high, medium, low, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING`)
        .run(r.repository, r.tag, r.digest, r.scanned_at, r.status, r.critical, r.high, r.medium, r.low, r.raw_json),
    insert: (r: Omit<ScanResult, 'id'>) =>
      getDb().prepare('INSERT INTO scan_results (repository, tag, digest, scanned_at, status, critical, high, medium, low, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.repository, r.tag, r.digest, r.scanned_at, r.status, r.critical, r.high, r.medium, r.low, r.raw_json),
  },

  // Audit log
  audit: {
    findRecent: (limit = 100) =>
      getDb().prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit) as AuditEntry[],
    search: (q: string, limit = 100) =>
      getDb().prepare('SELECT * FROM audit_log WHERE actor LIKE ? OR action LIKE ? OR target_type LIKE ? ORDER BY timestamp DESC LIMIT ?')
        .all(`%${q}%`, `%${q}%`, `%${q}%`, limit) as AuditEntry[],
    insert: (entry: Omit<AuditEntry, 'id'>) =>
      getDb().prepare('INSERT INTO audit_log (actor, action, target_type, target_id, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(entry.actor, entry.action, entry.target_type, entry.target_id, entry.detail, entry.ip, entry.timestamp),
  },

  // SSO providers
  sso: {
    findAll: () => getDb().prepare('SELECT * FROM sso_providers ORDER BY name').all() as SsoProvider[],
    findActive: () => getDb().prepare('SELECT * FROM sso_providers WHERE active = 1 ORDER BY name').all() as SsoProvider[],
    findById: (id: number) => getDb().prepare('SELECT * FROM sso_providers WHERE id = ?').get(id) as SsoProvider | undefined,
    create: (p: Omit<SsoProvider, 'id' | 'created_at'>) =>
      getDb().prepare('INSERT INTO sso_providers (name, type, client_id, client_secret, issuer_url, authorization_url, token_url, userinfo_url, domain_whitelist, default_role, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.name, p.type, p.client_id, p.client_secret, p.issuer_url, p.authorization_url, p.token_url, p.userinfo_url, p.domain_whitelist, p.default_role, p.active),
    update: (id: number, fields: Partial<SsoProvider>) => {
      const ALLOWED = new Set(['name', 'type', 'client_id', 'client_secret', 'issuer_url', 'authorization_url', 'token_url', 'userinfo_url', 'domain_whitelist', 'default_role', 'active'])
      const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.has(k)))
      if (!Object.keys(safe).length) return
      const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ')
      return getDb().prepare(`UPDATE sso_providers SET ${sets} WHERE id = ?`).run(...Object.values(safe), id)
    },
    delete: (id: number) => getDb().prepare('DELETE FROM sso_providers WHERE id = ?').run(id),
    saveState: (state: string, providerId: number) =>
      getDb().prepare('INSERT INTO oauth_states (state, provider_id, created_at) VALUES (?, ?, ?)').run(state, providerId, new Date().toISOString()),
    consumeState: (state: string) => {
      const row = getDb().prepare('SELECT * FROM oauth_states WHERE state = ? AND created_at > datetime("now", "-5 minutes")').get(state) as { provider_id: number } | undefined
      getDb().prepare('DELETE FROM oauth_states WHERE state = ?').run(state)
      return row
    },
  },

  // Storage snapshots
  storage: {
    latest: () =>
      getDb().prepare('SELECT repository, registry_type, size_bytes, blob_count, MAX(snapshotted_at) as snapshotted_at FROM storage_snapshots GROUP BY repository, registry_type ORDER BY size_bytes DESC').all() as StorageSnapshot[],
    upsert: (repository: string, type: string, sizeBytes: number, blobCount: number) =>
      getDb().prepare('INSERT INTO storage_snapshots (repository, registry_type, size_bytes, blob_count) VALUES (?, ?, ?, ?)')
        .run(repository, type, sizeBytes, blobCount),
    totalByType: () =>
      getDb().prepare('SELECT registry_type, SUM(size_bytes) as total FROM (SELECT repository, registry_type, size_bytes FROM storage_snapshots GROUP BY repository, registry_type) GROUP BY registry_type').all() as { registry_type: string; total: number }[],
  },
}
