import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { listRepositories, listTags, getManifest, getImageConfig, deleteManifest } from '@/lib/registry'
import { matchesPattern } from '@/lib/utils'

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { id } = await params
  const rule = db.cleanup.findById(Number(id))
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const repos = await listRepositories()
  const matchingRepos = repos.filter(r => matchesPattern(rule.repository_pattern, r))

  let deleted = 0

  for (const repo of matchingRepos) {
    const tags = await listTags(repo)
    const tagDetails: { tag: string; digest: string; created: string | null }[] = []

    for (const tag of tags) {
      const m = await getManifest(repo, tag)
      if (!m) continue
      const cfg = await getImageConfig(repo, m.manifest.config.digest)
      tagDetails.push({ tag, digest: m.digest, created: cfg?.created || null })
    }

    // Sort by created desc (newest first)
    tagDetails.sort((a, b) => {
      if (!a.created && !b.created) return 0
      if (!a.created) return 1
      if (!b.created) return -1
      return new Date(b.created).getTime() - new Date(a.created).getTime()
    })

    const toDelete = new Set<string>()

    // keep_last_n: mark everything beyond N for deletion
    if (rule.keep_last_n != null) {
      tagDetails.slice(rule.keep_last_n).forEach(t => toDelete.add(t.digest))
    }

    // max_age_days: mark old tags
    if (rule.max_age_days != null) {
      const cutoff = Date.now() - rule.max_age_days * 24 * 60 * 60 * 1000
      tagDetails.forEach(t => {
        if (t.created && new Date(t.created).getTime() < cutoff) toDelete.add(t.digest)
      })
    }

    for (const digest of toDelete) {
      const ok = await deleteManifest(repo, digest)
      if (ok) deleted++
    }

    // delete_untagged: handled separately by registry GC — we can't enumerate them via HTTP API
  }

  db.cleanup.update(rule.id, {
    last_run: new Date().toISOString(),
    last_deleted: deleted,
  })

  return NextResponse.json({ ok: true, deleted })
}
