'use client'
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import {
  Server, Lock, RefreshCw, Copy, ShieldCheck, ShieldOff,
  Trash2, Plus, Eye, EyeOff, Play, AlertTriangle
} from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface Props {
  healthy: boolean
  publicUrl: string
  registryUrl: string
  totpEnabled: boolean
}

const SSO_TYPES = [
  { value: 'google', label: 'Google' },
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'oidc', label: 'Generic OIDC' },
]

const CI_SNIPPETS = {
  'GitHub Actions': (url: string) => `- uses: docker/login-action@v3
  with:
    registry: ${url.replace(/^https?:\/\//, '')}
    username: token
    password: \${{ secrets.REGISTRY_TOKEN }}`,
  'GitLab CI': (url: string) => `before_script:
  - docker login ${url.replace(/^https?:\/\//, '')} -u token -p $REGISTRY_TOKEN`,
  'Jenkins (Groovy)': (url: string) => `withCredentials([string(credentialsId: 'registry-token', variable: 'TOKEN')]) {
  sh "docker login ${url.replace(/^https?:\/\//, '')} -u token -p $TOKEN"
}`,
  'Drone CI': (url: string) => `- name: push
  image: plugins/docker
  settings:
    registry: ${url.replace(/^https?:\/\//, '')}
    username: token
    password:
      from_secret: registry_token`,
}

export function SettingsPanel({ healthy, publicUrl, registryUrl, totpEnabled }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [gcLoading, setGcLoading] = useState(false)
  const [gcResult, setGcResult] = useState<{ ok: boolean; output: string } | null>(null)
  const [ssoProviders, setSsoProviders] = useState<Record<string, unknown>[]>([])
  const [ssoOpen, setSsoOpen] = useState(false)
  const [totpEnabled2, setTotpEnabled2] = useState(totpEnabled)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [activeCI, setActiveCI] = useState('GitHub Actions')

  useEffect(() => {
    apiFetch<{ readonly: boolean }>('/api/admin/readonly').then(({ data }) => { if (data) setReadonly(data.readonly) })
    apiFetch<Record<string, unknown>[]>('/api/settings/sso').then(({ data }) => { if (data) setSsoProviders(data) })
  }, [])

  function copy(text: string, key: string) { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000) }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPwLoading(true); setPwError(''); setPwSuccess(false)
    const fd = new FormData(e.currentTarget)
    const { ok, error } = await apiFetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: fd.get('current'), next: fd.get('next') }) })
    if (ok) { setPwSuccess(true); (e.target as HTMLFormElement).reset() } else setPwError(error || 'Failed')
    setPwLoading(false)
  }

  async function toggleReadonly() {
    const { ok, data } = await apiFetch<{ readonly: boolean }>('/api/admin/readonly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readonly: !readonly }) })
    if (ok && data) setReadonly(data.readonly)
  }

  async function runGc(dryRun: boolean) {
    setGcLoading(true); setGcResult(null)
    const { ok, data } = await apiFetch<{ ok: boolean; output: string }>('/api/admin/gc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) })
    if (ok && data) setGcResult(data)
    setGcLoading(false)
  }

  async function setupTotp() {
    const { ok, data } = await apiFetch<{ secret: string; qr: string }>('/api/auth/totp/setup')
    if (ok && data) setTotpSetup(data)
  }

  async function verifyTotp() {
    const { ok } = await apiFetch('/api/auth/totp/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: totpCode }) })
    if (ok) { setTotpEnabled2(true); setTotpSetup(null); setTotpCode('') }
  }

  async function disableTotp() {
    const { ok } = await apiFetch('/api/auth/totp/setup', { method: 'DELETE' })
    if (ok) setTotpEnabled2(false)
  }

  async function deleteSso(id: number) {
    await apiFetch(`/api/settings/sso/${id}`, { method: 'DELETE' })
    const { data } = await apiFetch<Record<string, unknown>[]>('/api/settings/sso')
    if (data) setSsoProviders(data)
  }

  async function handleAddSso(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await apiFetch('/api/settings/sso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(fd)) })
    const { data } = await apiFetch<Record<string, unknown>[]>('/api/settings/sso')
    if (data) setSsoProviders(data)
    setSsoOpen(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Registry status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Server size={14} /> Registry</span>
            <Badge variant={healthy ? 'success' : 'danger'}>{healthy ? 'Online' : 'Offline'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[['Internal URL', registryUrl], ['Public URL', publicUrl]].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">{label}</span>
              <code className="text-xs bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded">{val}</code>
            </div>
          ))}
          {/* Read-only toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
            <div>
              <p className="text-sm font-medium text-zinc-700">Read-only mode</p>
              <p className="text-xs text-zinc-400">Blocks all pushes and deletes</p>
            </div>
            <Button variant={readonly ? 'danger' : 'secondary'} size="sm" onClick={toggleReadonly}>
              {readonly ? <><ShieldOff size={13} /> Disable</> : <><ShieldCheck size={13} /> Enable</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Garbage Collection */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 size={14} /> Garbage Collection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Remove unreferenced blobs from storage. Stops the registry briefly during collection.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => runGc(true)} disabled={gcLoading}>
              <Play size={13} className={gcLoading ? 'animate-pulse' : ''} /> Dry run
            </Button>
            <Button variant="danger" size="sm" onClick={() => runGc(false)} disabled={gcLoading}>
              <Trash2 size={13} /> Run GC
            </Button>
          </div>
          {gcResult && (
            <div className={`rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${gcResult.ok ? 'bg-zinc-900 text-zinc-300' : 'bg-red-50 text-red-800'}`}>
              {gcResult.output || '(no output)'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CI/CD Snippets */}
      <Card>
        <CardHeader><CardTitle>CI/CD Integration</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {Object.keys(CI_SNIPPETS).map(k => (
              <button key={k} onClick={() => setActiveCI(k)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${activeCI === k ? 'bg-blue-600 text-white border-blue-600' : 'text-zinc-600 border-zinc-200 hover:border-blue-300'}`}>{k}</button>
            ))}
          </div>
          <div className="relative">
            <pre className="text-xs bg-zinc-900 text-zinc-300 rounded-lg p-3 pr-10 overflow-x-auto whitespace-pre-wrap">
              {CI_SNIPPETS[activeCI as keyof typeof CI_SNIPPETS]?.(publicUrl)}
            </pre>
            <button onClick={() => copy(CI_SNIPPETS[activeCI as keyof typeof CI_SNIPPETS]?.(publicUrl), 'ci')} className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300">
              <Copy size={13} />
            </button>
          </div>
          {copied === 'ci' && <p className="text-xs text-green-600">Copied!</p>}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Store your registry token in CI secrets/variables, never in source code. Create tokens in the <strong>Access Tokens</strong> page.</p>
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={14} /> Two-Factor Authentication</CardTitle></CardHeader>
        <CardContent>
          {!totpEnabled2 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">2FA is disabled. Enable it to require a TOTP code on login.</p>
              {!totpSetup ? (
                <Button size="sm" onClick={setupTotp}><ShieldCheck size={13} /> Set up 2FA</Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4 items-start">
                    <img src={totpSetup.qr} alt="QR code" className="w-36 h-36 rounded-lg border border-zinc-200" />
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-600">Scan with your authenticator app (Google Authenticator, Authy, etc.)</p>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-zinc-50 border px-2 py-1 rounded font-mono">{showSecret ? totpSetup.secret : '••••••••••••••••'}</code>
                        <button onClick={() => setShowSecret(!showSecret)} className="text-zinc-400 hover:text-zinc-600">{showSecret ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit code to verify" className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    <Button size="sm" onClick={verifyTotp} disabled={totpCode.length !== 6}>Verify & Enable</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700"><ShieldCheck size={16} className="text-green-600" /> 2FA is enabled</div>
              <Button variant="secondary" size="sm" onClick={disableTotp}><ShieldOff size={13} /> Disable</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SSO Providers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>SSO Providers</CardTitle>
            <Button size="sm" onClick={() => setSsoOpen(true)}><Plus size={13} /> Add provider</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {ssoProviders.length === 0 && <p className="text-sm text-zinc-400">No SSO providers configured</p>}
          {ssoProviders.map(p => (
            <div key={String(p.id)} className="flex items-center justify-between text-sm p-2 border border-zinc-100 rounded-lg">
              <div>
                <span className="font-medium text-zinc-800">{p.name as string}</span>
                <Badge variant="default" className="ml-2">{p.type as string}</Badge>
                {p.domain_whitelist ? <span className="text-xs text-zinc-400 ml-2">{String(p.domain_whitelist)}</span> : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteSso(Number(p.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></Button>
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
            {pwSuccess && <p className="text-xs text-green-600">Password updated</p>}
            <Button size="sm" type="submit" disabled={pwLoading}><RefreshCw size={13} />{pwLoading ? 'Updating…' : 'Update password'}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Add SSO dialog */}
      <Dialog open={ssoOpen} onClose={() => setSsoOpen(false)} title="Add SSO provider">
        <form onSubmit={handleAddSso} className="space-y-3">
          <Input label="Display name" name="name" required placeholder="Google Workspace" />
          <Select label="Type" name="type"><option value="">Select…</option>{SSO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
          <Input label="Client ID" name="client_id" required />
          <Input label="Client Secret" name="client_secret" type="password" required />
          <Input label="Issuer URL (OIDC only)" name="issuer_url" placeholder="https://accounts.google.com" />
          <Input label="Domain whitelist" name="domain_whitelist" placeholder="acme.com,acme.org (empty = allow all)" />
          <Select label="Default role for new users" name="default_role" defaultValue="viewer">
            <option value="viewer">Viewer</option>
            <option value="push">Push</option>
            <option value="admin">Admin</option>
          </Select>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" type="button" onClick={() => setSsoOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit">Add provider</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
