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
  db.groups.update(Number(id), body)
  logAction(session.username, 'group.update', 'group', id, body)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  db.groups.delete(Number(id))
  logAction(session.username, 'group.delete', 'group', id)
  return NextResponse.json({ ok: true })
}
