import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { regenerateConfig } from '@/lib/registry-config'
import { logAction } from '@/lib/audit'
import { getFeatures } from '@/lib/features'

export async function GET() {
  const readonly = db.settings.get('REGISTRY_READONLY') === 'true'
  return NextResponse.json({ readonly })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!getFeatures().docker) return NextResponse.json({ error: 'Docker disabled' }, { status: 404 })

  const { readonly } = await req.json()
  db.settings.set('REGISTRY_READONLY', String(readonly))
  try { regenerateConfig(readonly) } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
  logAction(session.username, 'registry.readonly', undefined, undefined, { readonly })
  return NextResponse.json({ ok: true, readonly })
}
