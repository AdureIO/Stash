import { LoginForm } from './login-form'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const ssoProviders = db.sso.findActive().map(p => ({ id: p.id, name: p.name, type: p.type }))
  return <LoginForm ssoProviders={ssoProviders} />
}
