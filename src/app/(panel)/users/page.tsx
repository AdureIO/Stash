import { UserList } from './user-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const users = db.users.findAll()
  const usersWithRules = users.map(u => ({
    ...u,
    rules: db.rules.findByUser(u.id),
  }))

  return (
    <div>
      <Header title="Users" subtitle="Manage registry access and permissions" />
      <UserList users={usersWithRules} />
    </div>
  )
}
