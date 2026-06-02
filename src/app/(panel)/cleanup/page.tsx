import { redirect } from 'next/navigation'
import { CleanupList } from './cleanup-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function CleanupPage() {
  try { await requireAdmin() } catch { redirect('/') }
  const rules = db.cleanup.findAll()
  return (
    <div>
      <Header
        title="Cleanup Rules"
        subtitle="Automatically remove old or unused images"
      />
      <CleanupList rules={rules} />
    </div>
  )
}
