'use client'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

interface Props { repo: string; tag: string; digest: string }

export function DeleteTagButton({ repo, tag, digest }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/registry/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, digest }),
    })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-red-400 hover:text-red-600 hover:bg-red-50">
        <Trash2 size={13} />
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete tag">
        <p className="text-sm text-zinc-600 mb-1">
          Delete <span className="font-mono font-medium">{repo}:{tag}</span>?
        </p>
        <p className="text-xs text-zinc-400 mb-5">This removes the manifest. Layers are cleaned up on next garbage collection.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
