import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { runCleanup } from '@/lib/cleanup-runner'
import { logAction } from '@/lib/audit'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await requireSuperAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const result = await runCleanup(Number(id))
  logAction(session.username, 'cleanup.run', 'cleanup_rule', id, result)
  return NextResponse.json({ ok: true, ...result })
}
