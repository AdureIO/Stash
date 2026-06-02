import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAction } from '@/lib/audit'

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  // Don't overwrite secret if placeholder sent
  if (body.client_secret === '***') delete body.client_secret
  db.sso.update(Number(id), body)
  logAction(session.username, 'sso.update', 'sso_provider', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  db.sso.delete(Number(id))
  logAction(session.username, 'sso.delete', 'sso_provider', id)
  return NextResponse.json({ ok: true })
}
