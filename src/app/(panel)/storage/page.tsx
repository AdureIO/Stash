'use client'
import { useState, useEffect } from 'react'
import { RefreshCw, HardDrive } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatBytes } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import type { StorageSnapshot } from '@/lib/db'

interface StorageData {
  snapshots: StorageSnapshot[]
  totals: { registry_type: string; total: number }[]
  cached: boolean
}

const TYPE_COLORS: Record<string, string> = { docker: '#3b82f6', maven: '#f97316', npm: '#a855f7' }

export default function StoragePage() {
  const [data, setData] = useState<StorageData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(refresh = false) {
    setLoading(true)
    const { ok, data: d } = await apiFetch<StorageData>(`/api/admin/storage${refresh ? '?refresh=1' : ''}`)
    if (ok && d) setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const chartData = data?.snapshots.slice(0, 20).map(s => ({
    name: s.repository.length > 20 ? '…' + s.repository.slice(-18) : s.repository,
    size: Math.round(s.size_bytes / 1024 / 1024),
    type: s.registry_type,
    fill: TYPE_COLORS[s.registry_type] || '#a1a1aa',
  })) ?? []

  return (
    <div>
      <Header
        title="Storage Analytics"
        subtitle="Disk usage across Docker, Maven, and NPM registries"
        actions={<Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</Button>}
      />

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(data?.totals ?? []).map(t => (
          <Card key={t.registry_type}>
            <CardContent className="flex items-center gap-3">
              <div className="w-3 h-10 rounded-sm" style={{ background: TYPE_COLORS[t.registry_type] || '#a1a1aa' }} />
              <div>
                <p className="text-xl font-semibold text-zinc-900">{formatBytes(t.total)}</p>
                <p className="text-xs text-zinc-500 capitalize">{t.registry_type}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {!data && (
          <Card><CardContent><div className="h-10 bg-zinc-100 rounded animate-pulse" /></CardContent></Card>
        )}
      </div>

      {/* Bar chart */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive size={14} /> Top repositories by size</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 && loading && <div className="h-48 bg-zinc-50 rounded animate-pulse" />}
          {chartData.length === 0 && !loading && <p className="text-sm text-zinc-400 text-center py-8">No storage data — click Refresh to scan</p>}
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={16} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}MB`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} width={140} />
                <Tooltip formatter={(v: number) => [`${v} MB`, 'Size']} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7', color: '#3f3f46' }} />
                <Bar dataKey="size" radius={[0, 3, 3, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {data && data.snapshots.length > 0 && (
        <Card>
          <div className="divide-y divide-zinc-50">
            {data.snapshots.map(s => (
              <div key={`${s.repository}-${s.registry_type}`} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-zinc-900">{s.repository}</span>
                  <Badge variant="default" className="ml-2 text-xs capitalize">{s.registry_type}</Badge>
                </div>
                <span className="text-sm text-zinc-600 font-medium">{formatBytes(s.size_bytes)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
