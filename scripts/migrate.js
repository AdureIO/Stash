// Bootstraps SQLite schema and first admin user.
// Run from container entrypoint (Docker) or via instrumentation (local dev) — never both at once in-process.
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const { mkdirSync } = require("fs");

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), "data", "db.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    schedule TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_run DATETIME,
    last_deleted INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
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
    repository TEXT NOT NULL,
    tag TEXT NOT NULL,
    digest TEXT NOT NULL,
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending',
    critical INTEGER NOT NULL DEFAULT 0,
    high INTEGER NOT NULL DEFAULT 0,
    medium INTEGER NOT NULL DEFAULT 0,
    low INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_scan_repo_tag ON scan_results(repository, tag);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail TEXT,
    ip TEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);

  CREATE TABLE IF NOT EXISTS sso_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    issuer_url TEXT,
    authorization_url TEXT,
    token_url TEXT,
    userinfo_url TEXT,
    domain_whitelist TEXT,
    default_role TEXT NOT NULL DEFAULT 'viewer',
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
`);

function addCol(table, col, def) {
	const cols = db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.map((c) => c.name);
	if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addCol("users", "totp_secret", "TEXT");
addCol("users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
addCol("users", "default_access", "TEXT NOT NULL DEFAULT 'deny'");

// One-time: legacy global admin → super-admin (new "admin" is space-scoped)
const rolesMigrated = db.prepare("SELECT value FROM settings WHERE key = 'roles_v2'").get();
if (!rolesMigrated) {
	db.prepare("UPDATE users SET role = 'superadmin' WHERE role = 'admin'").run();
	db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('roles_v2', '1')").run();
}
addCol("cleanup_rules", "schedule", "TEXT");
addCol("sso_providers", "default_group_id", "INTEGER");

// Seed first admin user
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(adminUsername);

if (existing && process.env.ADMIN_PASSWORD && process.env.ADMIN_RESET_PASSWORD === "true") {
	const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
	db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(hash, adminUsername);
	console.log(`[registry-admin] Admin password reset for user: ${adminUsername}`);
}

if (!existing) {
	let adminPassword = process.env.ADMIN_PASSWORD;
	const generated = !adminPassword;
	if (!adminPassword) {
		if (process.env.NODE_ENV === "development") {
			adminPassword = "admin";
		} else {
			const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
			adminPassword = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
		}
	}
	const hash = bcrypt.hashSync(adminPassword, 12);
	db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(
		adminUsername,
		hash,
		"superadmin",
	);

	if (generated) {
		console.log(`[registry-admin] ============================================`);
		console.log(`[registry-admin] First boot — admin credentials:`);
		console.log(`[registry-admin]   Username: ${adminUsername}`);
		console.log(`[registry-admin]   Password: ${adminPassword}`);
		console.log(`[registry-admin] Change this password after first login!`);
		console.log(`[registry-admin] ============================================`);
	}
}

try {
	db.pragma("wal_checkpoint(TRUNCATE)");
} catch {
	/* ignore */
}
db.close();
// Drop WAL sidecars so the Next.js process (stash user) does not hit SHMSIZE on Docker Desktop
const fs = require("fs");
for (const suffix of ["-wal", "-shm"]) {
	try {
		fs.unlinkSync(dbPath + suffix);
	} catch {
		/* ignore */
	}
}
console.log("[registry-admin] Database ready.");
