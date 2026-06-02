import { getDb } from './db'

export function logAction(
  actor: string,
  action: string,
  targetType?: string,
  targetId?: string | number,
  detail?: unknown,
  ip?: string
) {
  try {
    getDb().prepare(
      'INSERT INTO audit_log (actor, action, target_type, target_id, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      actor,
      action,
      targetType ?? null,
      targetId != null ? String(targetId) : null,
      detail ? JSON.stringify(detail) : null,
      ip ?? null,
      new Date().toISOString()
    )
  } catch { /* audit failures must never block operations */ }
}
