import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const users = db.users.findAll().map(u => ({ ...u, password_hash: undefined, rules: db.rules.findByUser(u.id) }))
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { username, password, role } = await req.json()
  if (!username || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!['admin', 'push', 'viewer'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (db.users.findByUsername(username)) return NextResponse.json({ error: 'Username taken' }, { status: 409 })
  const hash = await bcrypt.hash(password, 12)
  db.users.create(username, hash, role)
  return NextResponse.json({ ok: true }, { status: 201 })
}
