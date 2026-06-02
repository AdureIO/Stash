import { GroupList } from './group-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const groups = db.groups.findAll().map(g => ({
    ...g, members: db.groups.members(g.id), rules: db.groups.rules(g.id),
  }))
  const allUsers = db.users.findAll()
  return (
    <div>
      <Header title="Groups" subtitle="Manage team access with shared repository rules" />
      <GroupList groups={groups} allUsers={allUsers} />
    </div>
  )
}
