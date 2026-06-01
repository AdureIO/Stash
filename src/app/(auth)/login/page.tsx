'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
        return
      }

      // Parse error — guard against empty/non-JSON bodies
      let message = 'Invalid credentials'
      try {
        const data = await res.json()
        message = data.error || message
      } catch {
        message = res.status === 500 ? 'Server error — check logs' : message
      }
      setError(message)
    } catch {
      setError('Could not reach server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
            <Container size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Registry Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to manage your registry</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 space-y-4 border border-slate-700">
          <Input
            id="username"
            label="Username"
            labelClassName="text-slate-300"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
            autoComplete="username"
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
          />
          <Input
            id="password"
            label="Password"
            labelClassName="text-slate-300"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
          />

          {error && (
            <p className="text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          <Button type="submit" className="w-full justify-center" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
