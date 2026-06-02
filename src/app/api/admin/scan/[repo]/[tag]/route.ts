import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { scanImage } from '@/lib/trivy'
import { db } from '@/lib/db'

interface Params { params: Promise<{ repo: string; tag: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { repo, tag } = await params
  const repoName = decodeURIComponent(repo)
  const registryUrl = process.env.REGISTRY_URL || 'http://127.0.0.1:5000'

  try {
    const result = await scanImage(registryUrl, repoName, tag)
    db.scans.insert({
      repository: repoName, tag,
      digest: '',
      scanned_at: new Date().toISOString(),
      status: 'ok',
      critical: result.critical, high: result.high, medium: result.medium, low: result.low,
      raw_json: result.raw,
    })
    return NextResponse.json({ ok: true, ...result, raw: undefined })
  } catch (e) {
    db.scans.insert({
      repository: repoName, tag, digest: '',
      scanned_at: new Date().toISOString(),
      status: 'error',
      critical: 0, high: 0, medium: 0, low: 0,
      raw_json: (e as Error).message,
    })
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await requireAdmin().catch(() => null)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { repo, tag } = await params
  const result = db.scans.findByRepo(decodeURIComponent(repo), tag)
  if (!result) return NextResponse.json({ error: 'Not scanned yet' }, { status: 404 })
  return NextResponse.json(result)
}
