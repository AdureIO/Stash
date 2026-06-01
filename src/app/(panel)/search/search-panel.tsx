'use client'
import { useState } from 'react'
import { Search, Package, Activity } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatRelative } from '@/lib/utils'

interface SearchResult {
  repositories: { name: string; tagCount: number }[]
  events: { id: number; action: string; repository: string; tag: string | null; actor: string | null; timestamp: string }[]
}

const actionBadge = (action: string) => {
  if (action === 'push') return <Badge variant="success">push</Badge>
  if (action === 'pull') return <Badge variant="info">pull</Badge>
  if (action === 'delete') return <Badge variant="danger">delete</Badge>
  return <Badge>{action}</Badge>
}

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults(null); return }
    setLoading(true)
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
    if (res.ok) setResults(await res.json())
    setLoading(false)
  }

  const total = results ? results.repositories.length + results.events.length : 0

  return (
    <div className="max-w-2xl">
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search repositories, tags, actors..."
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          autoFocus
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Searching...</span>}
      </div>

      {results && query.length >= 2 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">{total} result{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;</p>

          {results.repositories.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Package size={13} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Repositories</span>
              </div>
              <div className="divide-y divide-slate-50">
                {results.repositories.map(r => (
                  <Link key={r.name} href={`/repositories/${encodeURIComponent(r.name)}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                    <span className="text-sm font-medium text-slate-900">{r.name}</span>
                    <Badge variant="default">{r.tagCount} tags</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {results.events.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Activity size={13} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Events</span>
              </div>
              <div className="divide-y divide-slate-50">
                {results.events.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-slate-900">{e.repository}</span>
                      {e.tag && <span className="text-xs text-slate-400 ml-2">:{e.tag}</span>}
                      {e.actor && <span className="text-xs text-slate-400 ml-2">by {e.actor}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {actionBadge(e.action)}
                      <span className="text-xs text-slate-400">{formatRelative(e.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {total === 0 && (
            <Card>
              <div className="py-12 text-center text-slate-400 text-sm">No results found</div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
