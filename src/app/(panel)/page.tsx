import { Package, Users, ArrowUp, ArrowDown, Box } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { listRepositories, healthCheck } from '@/lib/registry'
import { getFeatures } from '@/lib/features'
import { formatRelative, formatBytes } from '@/lib/utils'
import { ActivityChart } from '@/components/dashboard/activity-chart'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function mavenArtifactCount(root: string): number {
  if (!existsSync(root)) return 0
  let count = 0
  function walk(dir: string, depth: number) {
    if (depth > 6) return
    try {
      const entries = readdirSync(dir)
      const hasArtifacts = entries.some(e => e.endsWith('.jar') || e.endsWith('.pom'))
      if (hasArtifacts) { count++; return }
      entries.forEach(e => {
        try { if (statSync(path.join(dir, e)).isDirectory()) walk(path.join(dir, e), depth + 1) } catch {}
      })
    } catch {}
  }
  walk(root, 0)
  return count
}

const actionBadge = (action: string) => {
  if (action === 'push') return <Badge variant="success">push</Badge>
  if (action === 'pull') return <Badge variant="info">pull</Badge>
  if (action === 'delete') return <Badge variant="danger">delete</Badge>
  return <Badge>{action}</Badge>
}

export default async function DashboardPage() {
  const features = getFeatures()
  const users = db.users.findAll()
  const recentEvents = db.events.findRecent(8)
  const chart = db.events.last30Days()

  const repos = features.docker ? await listRepositories() : []
  const healthy = features.docker ? await healthCheck() : null
  const eventStats = features.docker ? db.events.stats() : null
  const mavenCount = features.maven ? mavenArtifactCount(process.env.MAVEN_ROOT || '/data/maven') : 0

  const statCards = [
    features.docker && { label: 'Docker Images', value: repos.length, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    features.maven  && { label: 'Maven Artifacts', value: mavenCount, icon: Box, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Users', value: users.length, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
    features.docker && eventStats && { label: 'Total Pushes', value: eventStats.pushes, icon: ArrowUp, color: 'text-green-600', bg: 'bg-green-50' },
    features.docker && eventStats && { label: 'Total Pulls', value: eventStats.pulls, icon: ArrowDown, color: 'text-amber-600', bg: 'bg-amber-50' },
  ].filter(Boolean) as { label: string; value: number; icon: React.ElementType; color: string; bg: string }[]

  const subtitle = features.docker
    ? healthy
      ? 'Registry is healthy and operational'
      : 'Registry is unreachable — check your configuration'
    : 'Maven repository active'

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={subtitle}
        actions={features.docker && healthy !== null ? (
          <Badge variant={healthy ? 'success' : 'danger'}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
            {healthy ? 'Online' : 'Offline'}
          </Badge>
        ) : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xl font-semibold text-zinc-900 tabular-nums">{value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Activity — last 30 days</CardTitle></CardHeader>
          <CardContent><ActivityChart data={chart} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent events</CardTitle></CardHeader>
          <div className="divide-y divide-zinc-50">
            {recentEvents.length === 0 && (
              <p className="px-5 py-8 text-sm text-center text-zinc-400">No events yet</p>
            )}
            {recentEvents.map(e => (
              <div key={e.id} className="px-5 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 truncate">{e.repository}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {e.tag ? `tag: ${e.tag}` : e.digest?.slice(7, 19)} · {formatRelative(e.timestamp)}
                  </p>
                </div>
                {actionBadge(e.action)}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
