// Database adapter — switches between SQLite (default) and PostgreSQL
// Set DATABASE_URL to a postgres:// URL to use PostgreSQL
// Otherwise falls back to SQLite at the path in DATABASE_URL (or ./data/db.sqlite)

export type DbAdapter = 'sqlite' | 'postgres'

export function getDbAdapter(): DbAdapter {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgres' : 'sqlite'
}

// ---- PostgreSQL pool (lazy) ----
let _pgPool: import('pg').Pool | null = null

export async function getPgPool(): Promise<import('pg').Pool> {
  if (_pgPool) return _pgPool
  const { Pool } = await import('pg')
  _pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
  return _pgPool
}

// ---- Convenience: run a query against whichever DB is configured ----
// For complex queries that differ between SQLite and PostgreSQL,
// check getDbAdapter() and branch. For simple queries that work in both,
// use the SQLite path (better-sqlite3 is the default).

export { getDb } from './db'
