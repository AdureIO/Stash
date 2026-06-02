import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { generatePat, hashPat } from '@/lib/pat'
import { logAction } from '@/lib/audit'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tokens = db.tokens.findByUser(session.userId)
  return NextResponse.json(tokens)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, scope, expiresAt } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const raw = generatePat()
  const hash = hashPat(raw)
  db.tokens.create(session.userId, name, hash, scope || 'pull,push', expiresAt)
  logAction(session.username, 'token.create', 'token', undefined, { name, scope })
  return NextResponse.json({ token: raw, name, scope }, { status: 201 })
}
