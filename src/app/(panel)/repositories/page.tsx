import Link from 'next/link'
import { Package, Tag, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/header'
import { listRepositories, listTags, getManifest, getImageConfig } from '@/lib/registry'
import { db } from '@/lib/db'
import { formatRelative, formatBytes } from '@/lib/utils'

export const dynamic = 'force-dynamic'

import { getFeatures } from '@/lib/features'
import { redirect } from 'next/navigation'

interface RepoSummary {
  name: string
  tagCount: number
  lastPush: string | null
  totalSize: number
}

async function getRepoSummaries(repos: string[]): Promise<RepoSummary[]> {
  return Promise.all(
    repos.map(async (name) => {
      const tags = await listTags(name)
      let lastPush: string | null = null
      let totalSize = 0

      // Get latest tag info only (avoid hitting every tag for performance)
      const latestTag = tags[tags.length - 1]
      if (latestTag) {
        const m = await getManifest(name, latestTag)
        if (m) {
          totalSize = m.manifest.layers.reduce((s, l) => s + l.size, 0)
          const cfg = await getImageConfig(name, m.manifest.config.digest)
          lastPush = cfg?.created || null
        }
      }

      // Fall back to event log
      if (!lastPush) {
        const events = db.events.findByRepo(name, 1)
        lastPush = events[0]?.timestamp || null
      }

      return { name, tagCount: tags.length, lastPush, totalSize }
    })
  )
}

export default async function RepositoriesPage() {
  if (!getFeatures().docker) redirect('/')
  const repos = await listRepositories()
  const summaries = await getRepoSummaries(repos)

  return (
    <div>
      <Header
        title="Repositories"
        subtitle={`${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}`}
      />

      {summaries.length === 0 && (
        <Card>
          <div className="py-16 text-center">
            <Package size={32} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No repositories yet</p>
            <p className="text-zinc-400 text-xs mt-1">Push an image to get started</p>
          </div>
        </Card>
      )}

      <div className="grid gap-3">
        {summaries.map(repo => (
          <Link key={repo.name} href={`/repositories/${encodeURIComponent(repo.name)}`}>
            <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package size={16} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 text-sm">{repo.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Tag size={10} /> {repo.tagCount} tags
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {formatRelative(repo.lastPush)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {repo.totalSize > 0 && (
                    <Badge variant="default">{formatBytes(repo.totalSize)}</Badge>
                  )}
                  <span className="text-zinc-300 text-sm">→</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
