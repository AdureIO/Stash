import { redirect } from 'next/navigation'
import { UserList } from './user-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  // Admin-only — enforce server-side before any data loads
  try { await requireAdmin() } catch { redirect('/') }

  const users = db.users.findAll()
  // Strip password_hash before serialising into the RSC payload
  const usersWithRules = users.map(({ password_hash: _omit, ...u }) => ({
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
