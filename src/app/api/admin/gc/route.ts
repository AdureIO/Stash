import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { runGarbageCollection } from '@/lib/gc'
import { logAction } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { dryRun } = await req.json().catch(() => ({ dryRun: false }))
  const result = await runGarbageCollection(dryRun)
  logAction(session.username, 'gc.run', undefined, undefined, { dryRun, ok: result.ok })
  return NextResponse.json(result)
}
