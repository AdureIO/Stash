import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { current, next } = await req.json()
  if (!current || !next) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (next.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  const user = db.users.findById(session.userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const valid = await bcrypt.compare(current, user.password_hash)
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })

  const hash = await bcrypt.hash(next, 12)
  db.users.update(user.id, { password_hash: hash })
  return NextResponse.json({ ok: true })
}
