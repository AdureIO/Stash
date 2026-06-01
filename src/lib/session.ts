// Edge-runtime safe — only jose, no Node.js modules
// Used by middleware for JWT verification
import { jwtVerify } from 'jose'

export const SESSION_COOKIE = 'ra_session'
export const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days

export interface Session {
  userId: number
  username: string
  role: string
}

function secret() {
  return new TextEncoder().encode(
    process.env.TOKEN_SECRET || 'dev-secret-change-in-production'
  )
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as Session
  } catch {
    return null
  }
}
