'use client'
import { useState } from 'react'
import { Plus, Trash2, Users, ChevronDown, ChevronRight, Shield } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { apiFetch } from '@/lib/api'
import type { Group, GroupRule, User } from '@/lib/db'

type GroupWithDetails = Group & { members: Pick<User,'id'|'username'|'role'>[]; rules: GroupRule[] }

interface Props { groups: GroupWithDetails[]; allUsers: Omit<User, 'password_hash'>[] }

export function GroupList({ groups: initial, allUsers }: Props) {
  const [groups, setGroups] = useState(initial)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    const { ok, data } = await apiFetch<GroupWithDetails[]>('/api/groups')
    if (ok && data) setGroups(data)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true)
    const fd = new FormData(e.currentTarget)
    await apiFetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fd.get('name'), description: fd.get('description') }) })
    setLoading(false); setAddOpen(false); await refresh()
  }

  async function handleDelete(id: number) {
    await apiFetch(`/api/groups/${id}`, { method: 'DELETE' }); await refresh()
  }

  async function addMember(groupId: number, userId: number) {
    await apiFetch(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh()
  }

  async function removeMember(groupId: number, userId: number) {
    await apiFetch(`/api/groups/${groupId}/members`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); await refresh()
  }

  async function addRule(e: React.FormEvent<HTMLFormElement>, groupId: number) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await apiFetch(`/api/groups/${groupId}/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository: fd.get('repository'), actions: fd.get('actions') }) })
    await refresh(); (e.target as HTMLFormElement).reset()
  }

  async function deleteRule(groupId: number, ruleId: number) {
    await apiFetch(`/api/groups/${groupId}/rules`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleId }) }); await refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)}><Plus size={14} /> New group</Button>
      </div>

      <div className="space-y-3">
        {groups.map(g => (
          <Card key={g.id}>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <button className="flex items-center gap-3 flex-1 text-left" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                  {expanded === g.id ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                  <div>
                    <p className="font-medium text-zinc-900 text-sm">{g.name}</p>
                    {g.description && <p className="text-xs text-zinc-400">{g.description}</p>}
                  </div>
                  <Badge variant="default" className="ml-2">{g.members.length} members</Badge>
                  <Badge variant="info" className="ml-1">{g.rules.length} rules</Badge>
                </button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(g.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={13} /></Button>
              </div>

              {expanded === g.id && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-zinc-100 pt-4">
                  {/* Members */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={12} /> Members</p>
                    <div className="space-y-1.5 mb-3">
                      {g.members.map(m => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-700">{m.username}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="default">{m.role}</Badge>
                            <button onClick={() => removeMember(g.id, m.id)} className="text-red-400 hover:text-red-600"><Trash2 size={11} /></button>
                          </div>
                        </div>
                      ))}
                      {g.members.length === 0 && <p className="text-xs text-zinc-400">No members</p>}
                    </div>
                    <Select onChange={e => { if (e.target.value) { addMember(g.id, Number(e.target.value)); e.target.value = '' } }} className="text-xs" defaultValue="">
                      <option value="" disabled>Add member…</option>
                      {allUsers.filter(u => !g.members.find(m => m.id === u.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </Select>
                  </div>

                  {/* Rules */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield size={12} /> Repository access</p>
                    <div className="space-y-1.5 mb-3">
                      {g.rules.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs">
                          <code className="bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded text-zinc-700">{r.repository}</code>
                          <div className="flex items-center gap-1.5">
                            {r.actions.split(',').map(a => <Badge key={a} variant="success">{a.trim()}</Badge>)}
                            <button onClick={() => deleteRule(g.id, r.id)} className="text-red-400 hover:text-red-600"><Trash2 size={11} /></button>
                          </div>
                        </div>
                      ))}
                      {g.rules.length === 0 && <p className="text-xs text-zinc-400">No rules — members inherit their role defaults</p>}
                    </div>
                    <form onSubmit={e => addRule(e, g.id)} className="flex gap-2">
                      <input name="repository" placeholder="org/team/* or *" required className="flex-1 text-xs px-2 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <select name="actions" className="text-xs px-2 py-1.5 border border-zinc-200 rounded-lg focus:outline-none">
                        <option value="pull">pull</option>
                        <option value="pull,push">pull,push</option>
                        <option value="pull,push,delete">all</option>
                      </select>
                      <Button size="sm" type="submit"><Plus size={12} /></Button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
        {groups.length === 0 && (
          <Card><div className="py-12 text-center text-zinc-400 text-sm">No groups — create one to share repository access rules across users</div></Card>
        )}
      </div>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="New group">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Name" name="name" required placeholder="backend-team" />
          <Input label="Description" name="description" placeholder="Optional description" />
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create group'}</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
