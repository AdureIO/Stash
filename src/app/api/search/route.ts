import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { listRepositories, listTags } from '@/lib/registry'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return NextResponse.json({ repositories: [], events: [] })

  const [allRepos, events] = await Promise.all([
    listRepositories(),
    db.events.search(q, 20),
  ])

  const matchingRepos = allRepos.filter(name =>
    name.toLowerCase().includes(q.toLowerCase())
  )

  const reposWithCounts = await Promise.all(
    matchingRepos.slice(0, 10).map(async name => ({
      name,
      tagCount: (await listTags(name)).length,
    }))
  )

  return NextResponse.json({ repositories: reposWithCounts, events })
}
