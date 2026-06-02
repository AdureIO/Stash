import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const q = req.nextUrl.searchParams.get('q') || ''
  const entries = q ? db.audit.search(q) : db.audit.findRecent(200)
  return NextResponse.json(entries)
}
