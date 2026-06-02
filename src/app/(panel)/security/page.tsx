import { SecurityPanel } from './security-panel'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const scans = db.scans.findAll()
  const features = getFeatures()
  return (
    <div>
      <Header title="Security" subtitle="Vulnerability scan results powered by Trivy" />
      <SecurityPanel scans={scans} dockerEnabled={features.docker} />
    </div>
  )
}
