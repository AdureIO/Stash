import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAction } from '@/lib/audit'

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const groups = db.groups.findAll().map(g => ({
    ...g,
    members: db.groups.members(g.id),
    rules: db.groups.rules(g.id),
  }))
  return NextResponse.json(groups)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, description } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  db.groups.create(name, description)
  logAction(session.username, 'group.create', 'group', undefined, { name })
  return NextResponse.json({ ok: true }, { status: 201 })
}
