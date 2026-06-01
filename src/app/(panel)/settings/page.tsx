import { SettingsPanel } from './settings-panel'
import { Header } from '@/components/layout/header'
import { healthCheck } from '@/lib/registry'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const healthy = await healthCheck()
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000'
  const registryUrl = process.env.REGISTRY_URL || 'http://127.0.0.1:5000'

  return (
    <div>
      <Header title="Settings" subtitle="Registry configuration and system info" />
      <SettingsPanel healthy={healthy} publicUrl={publicUrl} registryUrl={registryUrl} />
    </div>
  )
}
