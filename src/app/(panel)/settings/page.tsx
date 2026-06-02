import { SettingsPanel } from './settings-panel'
import { Header } from '@/components/layout/header'
import { healthCheck } from '@/lib/registry'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [healthy, session] = await Promise.all([healthCheck(), getSession()])
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000'
  const registryUrl = process.env.REGISTRY_URL || 'http://127.0.0.1:5000'
  const user = session ? db.users.findById(session.userId) : null
  const totpEnabled = !!(user?.totp_enabled && user.totp_secret)

  return (
    <div>
      <Header title="Settings" subtitle="Registry configuration and system info" />
      <SettingsPanel healthy={healthy} publicUrl={publicUrl} registryUrl={registryUrl} totpEnabled={totpEnabled} />
    </div>
  )
}
