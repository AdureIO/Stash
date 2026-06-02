import { redirect } from 'next/navigation'
import { WebhookList } from './webhook-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function WebhooksPage() {
  try { await requireAdmin() } catch { redirect('/') }
  const webhooks = db.webhooks.findAll()
  return (
    <div>
      <Header
        title="Webhooks"
        subtitle="Forward registry events to external URLs"
      />
      <WebhookList webhooks={webhooks} />
    </div>
  )
}
