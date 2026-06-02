'use client'
import { useState } from 'react'
import { Plus, Trash2, Copy, Check, Key } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { formatRelative, formatDate } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import type { Token } from '@/lib/db'

type SafeToken = Omit<Token, 'token_hash'>

interface Props { tokens: SafeToken[] }

const SCOPE_OPTIONS = [
  { value: 'pull', label: 'Read only (pull)' },
  { value: 'pull,push', label: 'Read + Write (pull, push)' },
  { value: 'pull,push,delete', label: 'Full access (pull, push, delete)' },
  { value: 'npm', label: 'NPM only' },
  { value: '*', label: 'All scopes' },
]

export function TokenList({ tokens: initial }: Props) {
  const [tokens, setTokens] = useState(initial)
  const [addOpen, setAddOpen] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const { ok, data } = await apiFetch<SafeToken[]>('/api/tokens')
    if (ok && data) setTokens(data)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const { ok, data } = await apiFetch<{ token: string }>('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fd.get('name'), scope: fd.get('scope'), expiresAt: fd.get('expiresAt') || undefined }),
    })
    setLoading(false)
    if (ok && data) {
      setNewToken(data.token)
      setAddOpen(false)
      await refresh()
    }
  }

  async function handleDelete(id: number) {
    await apiFetch(`/api/tokens/${id}`, { method: 'DELETE' })
    await refresh()
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {newToken && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">Token created — copy it now, it won&apos;t be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-zinc-800 font-mono break-all">{newToken}</code>
            <Button size="sm" variant="secondary" onClick={() => copy(newToken)}>
              {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            </Button>
          </div>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-green-600 hover:text-green-800">Dismiss</button>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)}><Plus size={14} /> New token</Button>
      </div>

      <Card>
        <Table>
          <Thead><tr><Th>Name</Th><Th>Scope</Th><Th>Last used</Th><Th>Expires</Th><Th>Created</Th><Th /></tr></Thead>
          <Tbody>
            {tokens.map(t => (
              <Tr key={t.id}>
                <Td><span className="flex items-center gap-2"><Key size={13} className="text-zinc-400" />{t.name}</span></Td>
                <Td>{t.scope.split(',').map(s => <Badge key={s} variant="default" className="mr-1">{s.trim()}</Badge>)}</Td>
                <Td className="text-zinc-500 text-xs">{formatRelative(t.last_used)}</Td>
                <Td className="text-zinc-500 text-xs">{t.expires_at ? formatDate(t.expires_at) : <span className="text-zinc-300">Never</span>}</Td>
                <Td className="text-zinc-500 text-xs">{formatRelative(t.created_at)}</Td>
                <Td><Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={13} /></Button></Td>
              </Tr>
            ))}
            {tokens.length === 0 && <Tr><Td colSpan={6} className="py-10 text-center text-zinc-400">No tokens yet — create one for CI/CD pipelines</Td></Tr>}
          </Tbody>
        </Table>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">Docker</p>
            <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{'docker login <registry> -u token -p <YOUR_TOKEN>'}</pre>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">NPM (.npmrc)</p>
            <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{'//your-registry/api/npm/:_authToken=<YOUR_TOKEN>'}</pre>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">GitHub Actions</p>
            <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3">{`- uses: docker/login-action@v3
  with:
    registry: \${{ secrets.REGISTRY_URL }}
    username: token
    password: \${{ secrets.REGISTRY_TOKEN }}`}</pre>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Create access token">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Token name" name="name" required placeholder="CI pipeline" />
          <Select label="Scope" name="scope" defaultValue="pull,push">
            {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Input label="Expires at (optional)" name="expiresAt" type="date" />
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create token'}</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
