import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { runGarbageCollection } from '@/lib/gc'
import { logAction } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { dryRun, deleteUntagged } = await req.json().catch(() => ({ dryRun: false, deleteUntagged: false }))
  const result = await runGarbageCollection(dryRun, deleteUntagged === true)
  logAction(session.username, 'gc.run', undefined, undefined, { dryRun, deleteUntagged: deleteUntagged === true, ok: result.ok })
  return NextResponse.json(result)
}
