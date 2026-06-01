import { Sidebar } from '@/components/layout/sidebar'
import { getFeatures } from '@/lib/features'

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const features = getFeatures()
  return (
    <div className="flex min-h-screen">
      <Sidebar features={features} />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
