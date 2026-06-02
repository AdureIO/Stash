import { Sidebar } from '@/components/layout/sidebar'
import { getFeatures } from '@/lib/features'

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const features = getFeatures()
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar features={features} />
      <main className="flex-1 p-6 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
