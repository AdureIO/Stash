import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Box } from 'lucide-react'
import { getFeatures } from '@/lib/features'
import { redirect } from 'next/navigation'
import { listPackages, NPM_ROOT } from '@/lib/npm-registry'
import { formatBytes } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function NpmPage() {
  if (!getFeatures().npm) redirect('/')
  const packages = listPackages()
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000'
  const registryUrl = `${publicUrl}/api/npm`

  return (
    <div>
      <Header title="NPM Packages" subtitle={`${packages.length} packages in registry`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {packages.length === 0 && (
            <Card><div className="py-12 text-center"><Box size={32} className="text-zinc-300 mx-auto mb-3" /><p className="text-sm text-zinc-500">No packages yet</p></div></Card>
          )}
          {packages.map(p => (
            <Card key={p.name}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono font-semibold text-zinc-900 text-sm">{p.name}</p>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {p.versions.map(v => <Badge key={v} variant="default">{v}</Badge>)}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-zinc-700">{formatBytes(p.size)}</p>
                  <p className="text-xs text-zinc-400">{p.versions.length} version{p.versions.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>.npmrc</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`registry=${registryUrl}/
//${publicUrl.replace(/^https?:\/\//, '')}/api/npm/:_authToken=YOUR_PAT`}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Login</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{`npm login --registry=${registryUrl}/`}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Publish</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{`npm publish --registry=${registryUrl}/`}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>package.json</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`"publishConfig": {
  "registry": "${registryUrl}/"
}`}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
