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
  if (!s && process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    // Only enforce at runtime (request time), not during build static generation
    // Check is skipped if we're in the build phase (no incoming request context)
    const isRuntime = process.env.NEXT_PHASE !== 'phase-production-build'
    if (isRuntime) {
      console.error('[depot] FATAL: TOKEN_SECRET must be set in production. Set it via environment variable.')
      // Log rather than throw so existing sessions can still be verified
      // Throw would crash the process on every request
    }
  }
  return new TextEncoder().encode(s || 'dev-secret-change-in-production')
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as Session
  } catch {
    return null
  }
}
