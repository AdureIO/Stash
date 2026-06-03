import { redirect } from 'next/navigation'
import { SecurityPanel } from './security-panel'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { requireSuperAdmin } from '@/lib/auth'
import { listRegistryImages } from '@/lib/registry'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  try { await requireSuperAdmin() } catch { redirect('/') }
  const scans = db.scans.findAll()
  const features = getFeatures()
  const images = features.docker ? await listRegistryImages() : []
  return (
    <div>
      <Header title="Security" subtitle="Vulnerability scan results powered by Trivy" />
      <SecurityPanel scans={scans} dockerEnabled={features.docker} images={images} />
    </div>
  )
}
