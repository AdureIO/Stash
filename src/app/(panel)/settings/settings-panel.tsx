'use client'
import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, XCircle, Copy, Server, Lock, RefreshCw } from 'lucide-react'

interface Props {
  healthy: boolean
  publicUrl: string
  registryUrl: string
}

export function SettingsPanel({ healthy, publicUrl, registryUrl }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPwLoading(true)
    setPwError('')
    setPwSuccess(false)
    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: fd.get('current'), next: fd.get('next') }),
    })
    const data = await res.json()
    if (res.ok) { setPwSuccess(true); (e.target as HTMLFormElement).reset() }
    else setPwError(data.error || 'Failed')
    setPwLoading(false)
  }

  const dockerLoginCmd = `docker login ${publicUrl.replace(/^https?:\/\//, '')}`
  const dockerPushCmd = `docker tag myimage:latest ${publicUrl.replace(/^https?:\/\//, '')}/myimage:latest\ndocker push ${publicUrl.replace(/^https?:\/\//, '')}/myimage:latest`

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Registry status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Server size={14} /> Registry</span>
            <Badge variant={healthy ? 'success' : 'danger'}>
              {healthy ? <CheckCircle size={11} className="mr-1" /> : <XCircle size={11} className="mr-1" />}
              {healthy ? 'Online' : 'Offline'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Internal URL</span>
            <code className="text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">{registryUrl}</code>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Public URL</span>
            <code className="text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">{publicUrl}</code>
          </div>
        </CardContent>
      </Card>

      {/* Quick start */}
      <Card>
        <CardHeader><CardTitle>Quick start</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Login', cmd: dockerLoginCmd },
            { label: 'Tag & push', cmd: dockerPushCmd },
          ].map(({ label, cmd }) => (
            <div key={label}>
              <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
              <div className="relative bg-slate-900 rounded-lg px-3 py-2.5 pr-10">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{cmd}</pre>
                <button
                  onClick={() => copy(cmd, label)}
                  className="absolute top-2 right-2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Copy size={13} />
                </button>
              </div>
              {copied === label && <p className="text-xs text-green-600 mt-1">Copied!</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock size={14} /> Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <Input label="Current password" name="current" type="password" required />
            <Input label="New password" name="next" type="password" required />
            {pwError && <p className="text-xs text-red-600">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-600">Password updated successfully</p>}
            <Button size="sm" type="submit" disabled={pwLoading}>
              <RefreshCw size={13} />
              {pwLoading ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
