import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { deleteManifest } from '@/lib/registry'
import { getFeatures } from '@/lib/features'

export async function DELETE(req: NextRequest) {
  if (!getFeatures().docker) return NextResponse.json({ error: 'Docker disabled' }, { status: 404 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { repo, digest } = await req.json()
  if (!repo || !digest) return NextResponse.json({ error: 'Missing repo or digest' }, { status: 400 })

  const ok = await deleteManifest(repo, digest)
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
