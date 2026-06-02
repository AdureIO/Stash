import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Copy, Layers, Cpu, HardDrive, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Header } from '@/components/layout/header'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { DeleteTagButton } from './delete-tag-button'
import { getRepositoryDetail, listTags } from '@/lib/registry'
// listTags used for 404 check on empty repos
import { formatBytes, formatRelative, shortDigest, formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ name: string }>
}

export default async function RepositoryDetailPage({ params }: Props) {
  const { name } = await params
  const repoName = decodeURIComponent(name)

  const details = await getRepositoryDetail(repoName)
  if (details.length === 0) {
    // Repo may exist with no tags — still show it, just empty
    const tags = await listTags(repoName)
    if (tags === null) notFound()
  }

  const totalSize = details.reduce((s, t) => s + t.size, 0)

  return (
    <div>
      <Link href="/repositories" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-4 transition-colors">
        <ArrowLeft size={14} /> Repositories
      </Link>

      <Header
        title={repoName}
        subtitle={`${details.length} tags · ${formatBytes(totalSize)} total`}
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3">
            <HardDrive size={16} className="text-zinc-400" />
            <div>
              <p className="text-lg font-semibold text-zinc-900">{formatBytes(totalSize)}</p>
              <p className="text-xs text-zinc-500">Total size</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Layers size={16} className="text-zinc-400" />
            <div>
              <p className="text-lg font-semibold text-zinc-900">{details.length}</p>
              <p className="text-xs text-zinc-500">Tags</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Calendar size={16} className="text-zinc-400" />
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {formatRelative(details[0]?.created || null)}
              </p>
              <p className="text-xs text-zinc-500">Last push</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tags table */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <Table>
          <Thead>
            <tr>
              <Th>Tag</Th>
              <Th>Digest</Th>
              <Th>Size</Th>
              <Th>Platform</Th>
              <Th>Created</Th>
              <Th>Pull command</Th>
              <Th />
            </tr>
          </Thead>
          <Tbody>
            {details.map(tag => (
              <Tr key={tag.tag}>
                <Td>
                  <span className="font-mono text-sm font-medium text-zinc-900">{tag.tag}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-zinc-500">{shortDigest(tag.digest)}</span>
                </Td>
                <Td>{formatBytes(tag.size)}</Td>
                <Td>
                  {tag.os && tag.architecture
                    ? <Badge variant="default">{tag.os}/{tag.architecture}</Badge>
                    : <span className="text-zinc-400">—</span>}
                </Td>
                <Td className="text-zinc-500 text-xs">{formatDate(tag.created)}</Td>
                <Td>
                  <code className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-0.5 text-zinc-600">
                    docker pull {repoName}:{tag.tag}
                  </code>
                </Td>
                <Td>
                  <DeleteTagButton repo={repoName} tag={tag.tag} digest={tag.digest} />
                </Td>
              </Tr>
            ))}
            {details.length === 0 && (
              <Tr>
                <Td className="py-8 text-center text-zinc-400" colSpan={7}>No tags found</Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Card>
    </div>
  )
}
