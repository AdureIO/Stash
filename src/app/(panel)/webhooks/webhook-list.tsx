'use client'
import { useState } from 'react'
import { Plus, Trash2, Pencil, Globe, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { formatRelative } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import type { WebhookTarget } from '@/lib/db'

interface Props { webhooks: WebhookTarget[] }

export function WebhookList({ webhooks: initial }: Props) {
  const [webhooks, setWebhooks] = useState(initial)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<WebhookTarget | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')

  async function refresh() {
    const { ok, data } = await apiFetch<WebhookTarget[]>('/api/webhooks')
    if (ok && data) setWebhooks(data)
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setApiError('')
    const fd = new FormData(e.currentTarget)
    const events = ['push', 'pull', 'delete'].filter(ev => fd.get(ev) === 'on').join(',')
    const { ok, error } = await apiFetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        repository_pattern: fd.get('repository_pattern') || '*',
        url: fd.get('url'),
        secret: fd.get('secret') || null,
        events: events || 'push',
        active: 1,
      }),
    })
    setLoading(false)
    if (!ok) { setApiError(error || 'Failed'); return }
    setAddOpen(false)
    await refresh()
  }

  async function handleDelete() {
    if (!deleteItem) return
    setLoading(true)
    await apiFetch(`/api/webhooks/${deleteItem.id}`, { method: 'DELETE' })
    setLoading(false)
    setDeleteItem(null)
    await refresh()
  }

  async function toggleActive(w: WebhookTarget) {
    await apiFetch(`/api/webhooks/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: w.active ? 0 : 1 }),
    })
    await refresh()
  }

  const statusBadge = (status: number | null) => {
    if (status === null) return <span className="text-zinc-300 text-xs">—</span>
    if (status >= 200 && status < 300) return <Badge variant="success">{status}</Badge>
    if (status === 0) return <Badge variant="danger">timeout</Badge>
    return <Badge variant="warning">{status}</Badge>
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)}><Plus size={14} /> Add webhook</Button>
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>URL</Th>
              <Th>Repository</Th>
              <Th>Events</Th>
              <Th>Last triggered</Th>
              <Th>Status</Th>
              <Th>Active</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {webhooks.map(w => (
              <Tr key={w.id}>
                <Td className="font-medium text-zinc-900">{w.name}</Td>
                <Td>
                  <span className="flex items-center gap-1.5 text-zinc-500 text-xs">
                    <Globe size={11} />
                    <span className="truncate max-w-[180px]">{w.url}</span>
                  </span>
                </Td>
                <Td><code className="text-xs bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded">{w.repository_pattern}</code></Td>
                <Td>
                  <div className="flex gap-1">
                    {w.events.split(',').map(ev => <Badge key={ev} variant="default">{ev.trim()}</Badge>)}
                  </div>
                </Td>
                <Td className="text-zinc-500 text-xs">{formatRelative(w.last_triggered)}</Td>
                <Td>{statusBadge(w.last_status)}</Td>
                <Td>
                  <button onClick={() => toggleActive(w)} className="transition-colors">
                    {w.active ? <CheckCircle size={16} className="text-green-500" /> : <XCircle size={16} className="text-zinc-300" />}
                  </button>
                </Td>
                <Td>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteItem(w)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={13} />
                  </Button>
                </Td>
              </Tr>
            ))}
            {webhooks.length === 0 && (
              <Tr><Td className="py-10 text-center text-zinc-400" colSpan={8}>No webhooks configured</Td></Tr>
            )}
          </Tbody>
        </Table>
      </Card>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add webhook">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Name" name="name" required placeholder="Slack notifications" />
          <Input label="URL" name="url" type="url" required placeholder="https://hooks.example.com/..." />
          <Input label="Repository pattern" name="repository_pattern" placeholder="* (all repos)" />
          <Input label="Secret" name="secret" placeholder="Optional — sent as X-Webhook-Secret header" />
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-2">Trigger on</p>
            <div className="flex gap-4">
              {['push', 'pull', 'delete'].map(ev => (
                <label key={ev} className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
                  <input type="checkbox" name={ev} defaultChecked={ev === 'push'} className="rounded" />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          {apiError && <p className="text-xs text-red-600">{apiError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create webhook'}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete webhook">
        <p className="text-sm text-zinc-600 mb-5">Delete webhook <span className="font-medium">{deleteItem?.name}</span>?</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>Delete</Button>
        </div>
      </Dialog>
    </>
  )
}
