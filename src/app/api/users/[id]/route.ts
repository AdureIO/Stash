import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  const { role, password } = await req.json()
  const update: Record<string, string> = {}
  if (role) update.role = role
  if (password) update.password_hash = await bcrypt.hash(password, 12)
  db.users.update(Number(id), update)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  db.users.delete(Number(id))
  return NextResponse.json({ ok: true })
}
