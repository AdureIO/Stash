// Node.js runtime only — uses DB, bcrypt, cookies
// Do NOT import this from middleware (use session.ts instead)
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { db } from './db'
import bcrypt from 'bcryptjs'
import { SESSION_COOKIE, SESSION_DURATION, verifySession, type Session } from './session'

export { SESSION_COOKIE, SESSION_DURATION, type Session }

// Lazy — evaluated at request time, not module init (so Next.js build doesn't fail)
function getSessionSecret(): Uint8Array {
  const s = process.env.TOKEN_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
      throw new Error(
        '[depot] TOKEN_SECRET environment variable is not set. ' +
        'Set a cryptographically random value before starting in production.'
      )
    }
    return new TextEncoder().encode('dev-secret-change-in-production')
  }
  return new TextEncoder().encode(s)
}

export async function createSession(session: Session): Promise<string> {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSessionSecret())
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return session
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.role !== 'admin') throw new Error('Forbidden')
  return session
}

export async function login(username: string, password: string): Promise<string | null> {
  const user = db.users.findByUsername(username)
  if (!user) return null

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return null

  db.users.update(user.id, { last_login: new Date().toISOString() })

  return createSession({ userId: user.id, username: user.username, role: user.role })
}
