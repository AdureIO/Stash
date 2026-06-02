import { redirect } from 'next/navigation'
import { GroupList } from './group-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  try { await requireAdmin() } catch { redirect('/') }

  const groups = db.groups.findAll().map(g => ({
    ...g, members: db.groups.members(g.id), rules: db.groups.rules(g.id),
  }))
  // Strip password_hash before RSC serialisation — GroupList only needs id/username/role
  const allUsers = db.users.findAll().map(({ password_hash: _omit, ...u }) => u)
  return (
    <div>
      <Header title="Groups" subtitle="Manage team access with shared repository rules" />
      <GroupList groups={groups} allUsers={allUsers} />
    </div>
  )
}
