import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  return NextResponse.json(db.groups.rules(Number(id)))
}

export async function POST(req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  const { repository, actions } = await req.json()
  db.groups.addRule(Number(id), repository || '*', actions || 'pull')
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { ruleId } = await req.json()
  db.groups.deleteRule(Number(ruleId))
  return NextResponse.json({ ok: true })
}
