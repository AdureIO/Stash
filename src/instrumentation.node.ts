// Keep Next.js instrumentation free of SQLite/cron imports (they break WAL on Docker Desktop).
// Docker: migrate.js + scripts/cron.js via entrypoint/supervisord.
// Local dev: run migrate once if needed.
import { execSync } from 'child_process'
import { join } from 'path'

const isPostgres = (process.env.DATABASE_URL || '').match(/^postgres(ql)?:\/\//)

if (isPostgres) {
  console.log('[depot] Using PostgreSQL — run migrations manually.')
} else if (process.env.DEPOT_MIGRATED !== '1') {
  const script = join(process.cwd(), 'scripts', 'migrate.js')
  execSync(`node "${script}"`, { stdio: 'inherit', env: process.env })
}
