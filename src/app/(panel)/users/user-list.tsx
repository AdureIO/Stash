'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Shield, Eye, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { formatRelative } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import type { User, AccessRule } from '@/lib/db'

// Omit password_hash — never sent from server to client
type UserWithRules = Omit<User, 'password_hash'> & { rules: AccessRule[] }

const roleIcon = { admin: Shield, push: Upload, viewer: Eye }
const roleBadge = { admin: 'info', push: 'success', viewer: 'default' } as const

interface Props { users: UserWithRules[] }

export function UserList({ users: initial }: Props) {
  const [users, setUsers] = useState(initial)
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserWithRules | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserWithRules | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')

  async function refresh() {
    const { ok, data } = await apiFetch<UserWithRules[]>('/api/users')
    if (ok && data) setUsers(data)
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setApiError('')
    const fd = new FormData(e.currentTarget)
    const { ok, error } = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password'), role: fd.get('role') }),
    })
    setLoading(false)
    if (!ok) { setApiError(error || 'Failed'); return }
    setAddOpen(false)
    await refresh()
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editUser) return
    setLoading(true)
    setApiError('')
    const fd = new FormData(e.currentTarget)
    const { ok, error } = await apiFetch(`/api/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: fd.get('role'), password: fd.get('password') || undefined }),
    })
    setLoading(false)
    if (!ok) { setApiError(error || 'Failed'); return }
    setEditUser(null)
    await refresh()
  }

  async function handleDelete() {
    if (!deleteUser) return
    setLoading(true)
    await apiFetch(`/api/users/${deleteUser.id}`, { method: 'DELETE' })
    setLoading(false)
    setDeleteUser(null)
    await refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)}><Plus size={14} /> Add user</Button>
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th>Username</Th>
              <Th>Role</Th>
              <Th>Last login</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {users.map(u => {
              const Icon = roleIcon[u.role] || Eye
              return (
                <Tr key={u.id}>
                  <Td>
                    <span className="flex items-center gap-2 font-medium text-zinc-900">
                      <Icon size={14} className="text-zinc-400" />
                      {u.username}
                    </span>
                  </Td>
                  <Td><Badge variant={roleBadge[u.role]}>{u.role}</Badge></Td>
                  <Td className="text-zinc-500 text-xs">{formatRelative(u.last_login)}</Td>
                  <Td className="text-zinc-500 text-xs">{formatRelative(u.created_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditUser(u)}><Pencil size={13} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteUser(u)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              )
            })}
            {users.length === 0 && (
              <Tr><Td className="py-8 text-center text-zinc-400" colSpan={5}>No users</Td></Tr>
            )}
          </Tbody>
        </Table>
      </Card>

      {/* Add user */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setApiError('') }} title="Add user">
        <form onSubmit={handleAdd} className="space-y-4">
          <Input label="Username" name="username" required placeholder="username" />
          <Input label="Password" name="password" type="password" required placeholder="••••••••" />
          <Select label="Role" name="role" defaultValue="viewer">
            <option value="viewer">Viewer — pull only</option>
            <option value="push">Push — pull + push</option>
            <option value="admin">Admin — full access</option>
          </Select>
          {apiError && <p className="text-xs text-red-600">{apiError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create user'}</Button>
          </div>
        </form>
      </Dialog>

      {/* Edit user */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} title="Edit user">
        {editUser && (
          <form onSubmit={handleEdit} className="space-y-4">
            <Input label="Username" value={editUser.username} disabled />
            <Input label="New password" name="password" type="password" placeholder="Leave blank to keep current" />
            <Select label="Role" name="role" defaultValue={editUser.role}>
              <option value="viewer">Viewer — pull only</option>
              <option value="push">Push — pull + push</option>
              <option value="admin">Admin — full access</option>
            </Select>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" type="button" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button size="sm" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save changes'}</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteUser} onClose={() => setDeleteUser(null)} title="Delete user">
        <p className="text-sm text-zinc-600 mb-5">
          Delete user <span className="font-medium">{deleteUser?.username}</span>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteUser(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
