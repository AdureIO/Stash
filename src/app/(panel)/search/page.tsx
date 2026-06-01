import { SearchPanel } from './search-panel'
import { Header } from '@/components/layout/header'

export default function SearchPage() {
  return (
    <div>
      <Header title="Search" subtitle="Search repositories, tags, and events" />
      <SearchPanel />
    </div>
  )
}
