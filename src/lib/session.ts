// Edge-runtime safe — only jose, no Node.js modules
// Used by middleware for JWT verification
import { jwtVerify } from 'jose'

export const SESSION_COOKIE = 'ra_session'
export const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days

export interface Session {
  userId: number
  username: string
  role: string
  totpVerified?: boolean
}

function secret() {
  const s = process.env.TOKEN_SECRET
  if (!s) {
    // During Next.js build, NEXT_PHASE is set — allow the fallback so the build completes.
    // At actual request time (runtime) in production, NEXT_PHASE is unset — hard fail.
    if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
      throw new Error(
        '[depot] TOKEN_SECRET environment variable is not set. ' +
        'Set a cryptographically random value (e.g. openssl rand -hex 32) before starting in production.'
      )
    }
    return new TextEncoder().encode('dev-secret-change-in-production')
  }
  return new TextEncoder().encode(s)
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as Session
  } catch {
    return null
  }
}
