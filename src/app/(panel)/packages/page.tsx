import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/utils'
import { Box, Download, Package } from 'lucide-react'

export const dynamic = 'force-dynamic'

import { getFeatures } from '@/lib/features'
import { redirect } from 'next/navigation'

const MAVEN_ROOT = process.env.MAVEN_ROOT || '/data/maven'

interface Artifact {
  groupId: string
  artifactId: string
  versions: string[]
  size: number
}

function dirSize(dir: string): number {
  let total = 0
  try {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f)
      const s = statSync(full)
      total += s.isDirectory() ? dirSize(full) : s.size
    }
  } catch { /* ignore */ }
  return total
}

// Walk the maven tree and identify artifacts (dirs containing version subdirs with .jar/.pom)
function scanArtifacts(root: string): Artifact[] {
  const artifacts: Artifact[] = []
  if (!existsSync(root)) return artifacts

  function walk(dir: string, segments: string[]) {
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }

    // Check if this directory contains version subdirs (each having .jar or .pom files)
    const versionDirs = entries.filter(e => {
      const full = path.join(dir, e)
      try {
        if (!statSync(full).isDirectory()) return false
        return readdirSync(full).some(f => f.endsWith('.jar') || f.endsWith('.pom') || f.endsWith('.war') || f.endsWith('.aar'))
      } catch { return false }
    })

    if (versionDirs.length > 0 && segments.length >= 2) {
      const artifactId = segments.at(-1)!
      const groupId = segments.slice(0, -1).join('.')
      artifacts.push({
        groupId,
        artifactId,
        versions: versionDirs.sort(),
        size: dirSize(dir),
      })
      return
    }

    // Recurse into subdirs
    for (const e of entries) {
      const full = path.join(dir, e)
      try { if (statSync(full).isDirectory()) walk(full, [...segments, e]) } catch { /* ignore */ }
    }
  }

  walk(root, [])
  return artifacts.sort((a, b) => `${a.groupId}:${a.artifactId}`.localeCompare(`${b.groupId}:${b.artifactId}`))
}

export default async function PackagesPage() {
  if (!getFeatures().maven) redirect('/')
  const artifacts = scanArtifacts(MAVEN_ROOT)
  const totalSize = artifacts.reduce((s, a) => s + a.size, 0)
  const totalVersions = artifacts.reduce((s, a) => s + a.versions.length, 0)

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000'
  const mavenUrl = `${publicUrl}/api/maven`

  return (
    <div>
      <Header
        title="Maven Packages"
        subtitle={`${artifacts.length} artifacts · ${totalVersions} versions · ${formatBytes(totalSize)}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Artifacts list */}
        <div className="lg:col-span-2 space-y-3">
          {artifacts.length === 0 && (
            <Card>
              <div className="py-16 text-center">
                <Box size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No packages yet</p>
                <p className="text-slate-400 text-xs mt-1">Push a Maven artifact to get started</p>
              </div>
            </Card>
          )}

          {artifacts.map(a => (
            <Card key={`${a.groupId}:${a.artifactId}`}>
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Package size={14} className="text-blue-500 flex-shrink-0" />
                    <code className="text-sm font-semibold text-slate-900 truncate">
                      {a.groupId}:{a.artifactId}
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {a.versions.map(v => (
                      <Badge key={v} variant="default">{v}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-slate-700">{formatBytes(a.size)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{a.versions.length} version{a.versions.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Usage sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Maven</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">~/.m2/settings.xml</p>
                <pre className="text-xs bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`<server>
  <id>registry</id>
  <username>YOUR_USER</username>
  <password>YOUR_PASS</password>
</server>`}</pre>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1.5">pom.xml</p>
                <pre className="text-xs bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`<repository>
  <id>registry</id>
  <url>${mavenUrl}</url>
</repository>

<distributionManagement>
  <repository>
    <id>registry</id>
    <url>${mavenUrl}</url>
  </repository>
</distributionManagement>`}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Gradle</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`maven {
  url = "${mavenUrl}"
  credentials {
    username = "YOUR_USER"
    password = "YOUR_PASS"
  }
}`}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Deploy</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`mvn deploy \\
  -DaltDeploymentRepository=\\
  registry::${mavenUrl}`}</pre>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
