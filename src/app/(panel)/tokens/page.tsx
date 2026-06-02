import { TokenList } from './token-list'
import { Header } from '@/components/layout/header'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TokensPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const tokens = db.tokens.findByUser(session.userId)
  return (
    <div>
      <Header title="Access Tokens" subtitle="Personal access tokens for CI/CD and scripts" />
      <TokenList tokens={tokens} />
    </div>
  )
}
