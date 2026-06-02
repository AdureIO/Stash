import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const actionColor = (action: string) => {
  if (action.includes('delete') || action.includes('fail')) return 'danger'
  if (action.includes('create') || action.includes('enable')) return 'success'
  if (action.includes('login')) return 'info'
  return 'default'
}

export default async function AuditPage() {
  try { await requireAdmin() } catch { redirect('/') }
  const entries = db.audit.findRecent(200)

  return (
    <div>
      <Header title="Audit Log" subtitle="Admin actions and authentication events" />
      <Card>
        <Table>
          <Thead>
            <tr><Th>Action</Th><Th>Actor</Th><Th>Target</Th><Th>Detail</Th><Th>IP</Th><Th>Timestamp</Th></tr>
          </Thead>
          <Tbody>
            {entries.map(e => (
              <Tr key={e.id}>
                <Td><Badge variant={actionColor(e.action)}>{e.action}</Badge></Td>
                <Td className="font-medium text-zinc-900">{e.actor}</Td>
                <Td className="text-zinc-500 text-xs">
                  {e.target_type && <span className="bg-zinc-100 px-1.5 py-0.5 rounded mr-1">{e.target_type}</span>}
                  {e.target_id}
                </Td>
                <Td className="text-zinc-400 text-xs max-w-xs truncate">
                  {e.detail ? (() => { try { return JSON.stringify(JSON.parse(e.detail)) } catch { return e.detail } })() : '—'}
                </Td>
                <Td className="text-zinc-400 text-xs">{e.ip || '—'}</Td>
                <Td className="text-xs text-zinc-400">{formatDate(e.timestamp)}</Td>
              </Tr>
            ))}
            {entries.length === 0 && <Tr><Td colSpan={6} className="py-10 text-center text-zinc-400">No audit entries yet</Td></Tr>}
          </Tbody>
        </Table>
      </Card>
    </div>
  )
}
