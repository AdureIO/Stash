'use client'
import { useState } from 'react'
import { Plus, Trash2, Play, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { formatRelative } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import type { CleanupRule } from '@/lib/db'

interface Props { rules: CleanupRule[] }

export function CleanupList({ rules: initial }: Props) {
  const [rules, setRules] = useState(initial)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<CleanupRule | null>(null)
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [runResult, setRunResult] = useState<{ id: number; deleted: number } | null>(null)

  async function refresh() {
    const { ok, data } = await apiFetch<CleanupRule[]>('/api/cleanup')
    if (ok && data) setRules(data)
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    await apiFetch('/api/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        repository_pattern: fd.get('repository_pattern') || '*',
        keep_last_n: fd.get('keep_last_n') ? Number(fd.get('keep_last_n')) : null,
        max_age_days: fd.get('max_age_days') ? Number(fd.get('max_age_days')) : null,
        delete_untagged: fd.get('delete_untagged') === 'on' ? 1 : 0,
        active: 1,
      }),
    })
    setLoading(false)
    setAddOpen(false)
    await refresh()
  }

  async function handleDelete() {
    if (!deleteItem) return
    setLoading(true)
    await apiFetch(`/api/cleanup/${deleteItem.id}`, { method: 'DELETE' })
    setLoading(false)
    setDeleteItem(null)
    await refresh()
  }

  async function handleRun(rule: CleanupRule) {
    setRunningId(rule.id)
    const { data } = await apiFetch<{ deleted: number }>(`/api/cleanup/${rule.id}/run`, { method: 'POST' })
    setRunResult({ id: rule.id, deleted: data?.deleted ?? 0 })
    setRunningId(null)
    await refresh()
  }

  async function toggleActive(r: CleanupRule) {
    await apiFetch(`/api/cleanup/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: r.active ? 0 : 1 }),
    })
    await refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)}><Plus size={14} /> Add rule</Button>
      </div>

      {runResult && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-center justify-between">
          <span>Cleanup complete — <strong>{runResult.deleted}</strong> tag{runResult.deleted !== 1 ? 's' : ''} deleted</span>
          <button onClick={() => setRunResult(null)} className="text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Repository</Th>
              <Th>Keep last N</Th>
              <Th>Max age</Th>
              <Th>Untagged</Th>
              <Th>Last run</Th>
              <Th>Deleted</Th>
              <Th>Active</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {rules.map(r => (
              <Tr key={r.id}>
                <Td className="font-medium text-slate-900">{r.name}</Td>
                <Td><code className="text-xs bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{r.repository_pattern}</code></Td>
                <Td>{r.keep_last_n ?? '—'}</Td>
                <Td>{r.max_age_days ? `${r.max_age_days}d` : '—'}</Td>
                <Td>{r.delete_untagged ? <Badge variant="warning">yes</Badge> : '—'}</Td>
                <Td className="text-xs text-slate-500">{formatRelative(r.last_run)}</Td>
                <Td>{r.last_deleted != null ? r.last_deleted : '—'}</Td>
                <Td>
                  <button onClick={() => toggleActive(r)}>
                    {r.active ? <CheckCircle size={16} className="text-green-500" /> : <XCircle size={16} className="text-slate-300" />}
                  </button>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleRun(r)} disabled={runningId === r.id}>
                      <Play size={13} className={runningId === r.id ? 'animate-pulse' : ''} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteItem(r)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
            {rules.length === 0 && (
              <Tr><Td className="py-10 text-center text-slate-400" colSpan={9}>No cleanup rules defined</Td></Tr>
            )}
          </Tbody>
        </Table>
      </Card>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add cleanup rule">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Name" name="name" required placeholder="Keep last 5 tags" />
          <Input label="Repository pattern" name="repository_pattern" placeholder="* (all repos) or myapp/*" />
          <Input label="Keep last N tags" name="keep_last_n" type="number" min="1" placeholder="e.g. 5" />
          <Input label="Delete tags older than (days)" name="max_age_days" type="number" min="1" placeholder="e.g. 30" />
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" name="delete_untagged" className="rounded" />
            Also delete untagged manifests
          </label>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create rule'}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleteItem} onClose={() => setDeleteItem(null)} title="Delete rule">
        <p className="text-sm text-slate-600 mb-5">Delete rule <span className="font-medium">{deleteItem?.name}</span>?</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>Delete</Button>
        </div>
      </Dialog>
    </>
  )
}
