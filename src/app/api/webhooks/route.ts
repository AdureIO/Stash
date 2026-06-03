import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try { await requireSuperAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return NextResponse.json(db.webhooks.findAll())
}

export async function POST(req: NextRequest) {
  try { await requireSuperAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const body = await req.json()
  db.webhooks.create(body)
  return NextResponse.json({ ok: true }, { status: 201 })
}
