import { NextRequest, NextResponse } from 'next/server'
import { runCleanup } from '@/lib/cleanup-runner'

export const dynamic = 'force-dynamic'

/** Called by scripts/cron.js in the container — not exposed to browsers. */
export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal') !== 'cron') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const result = await runCleanup()
  return NextResponse.json({ ok: true, ...result })
}
