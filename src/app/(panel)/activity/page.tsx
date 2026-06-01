import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { db } from '@/lib/db'
import { formatDate, formatBytes, shortDigest } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const actionBadge = (action: string) => {
  if (action === 'push') return <Badge variant="success">push</Badge>
  if (action === 'pull') return <Badge variant="info">pull</Badge>
  if (action === 'delete') return <Badge variant="danger">delete</Badge>
  return <Badge>{action}</Badge>
}

export default async function ActivityPage() {
  const events = db.events.findRecent(200)
  const stats = db.events.stats()

  return (
    <div>
      <Header title="Activity Log" subtitle="Registry push, pull, and delete events" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pushes', value: stats.pushes, variant: 'success' as const },
          { label: 'Pulls', value: stats.pulls, variant: 'info' as const },
          { label: 'Deletes', value: stats.deletes, variant: 'danger' as const },
        ].map(({ label, value, variant }) => (
          <Card key={label}>
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <Badge variant={variant}>{value}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th>Action</Th>
              <Th>Repository</Th>
              <Th>Tag</Th>
              <Th>Digest</Th>
              <Th>Actor</Th>
              <Th>IP</Th>
              <Th>Size</Th>
              <Th>Timestamp</Th>
            </tr>
          </Thead>
          <Tbody>
            {events.map(e => (
              <Tr key={e.id}>
                <Td>{actionBadge(e.action)}</Td>
                <Td className="font-medium text-slate-900">{e.repository}</Td>
                <Td className="font-mono text-xs">{e.tag || '—'}</Td>
                <Td className="font-mono text-xs text-slate-400">{shortDigest(e.digest)}</Td>
                <Td className="text-slate-500">{e.actor || '—'}</Td>
                <Td className="text-slate-400 text-xs">{e.ip || '—'}</Td>
                <Td className="text-slate-500">{e.size ? formatBytes(e.size) : '—'}</Td>
                <Td className="text-xs text-slate-400">{formatDate(e.timestamp)}</Td>
              </Tr>
            ))}
            {events.length === 0 && (
              <Tr><Td className="py-10 text-center text-slate-400" colSpan={8}>No events yet. Events are captured when the registry is used.</Td></Tr>
            )}
          </Tbody>
        </Table>
      </Card>
    </div>
  )
}
