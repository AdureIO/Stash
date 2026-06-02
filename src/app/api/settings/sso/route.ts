import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAction } from '@/lib/audit'

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  // Redact secrets
  const providers = db.sso.findAll().map(p => ({ ...p, client_secret: '***' }))
  return NextResponse.json(providers)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  db.sso.create(body)
  logAction(session.username, 'sso.create', 'sso_provider', undefined, { name: body.name, type: body.type })
  return NextResponse.json({ ok: true }, { status: 201 })
}
