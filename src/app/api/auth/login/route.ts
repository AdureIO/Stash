import { NextRequest, NextResponse } from 'next/server'
import { login, SESSION_COOKIE, SESSION_DURATION, createSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAction } from '@/lib/audit'
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown'

    // Rate limit: 10 attempts per 15 minutes per IP
    if (!checkRateLimit(`login:${ip}`, 10)) {
      return NextResponse.json({ error: 'Too many login attempts — try again later' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const { username, password } = body
    if (!username || !password) return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })

    const token = await login(username, password)
    if (!token) {
      logAction(username, 'auth.login_fail', 'user', undefined, undefined, ip)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Clear rate limit on success
    clearRateLimit(`login:${ip}`)

    const user = db.users.findByUsername(username)

    // 2FA required — issue short-lived partial session
    if (user?.totp_enabled && user.totp_secret) {
      const partialToken = await createSession({
        userId: user.id, username: user.username, role: user.role, totpVerified: false,
      })
      const res = NextResponse.json({ totp_required: true }, { status: 202 })
      res.cookies.set(SESSION_COOKIE, partialToken, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 300, path: '/',
      })
      return res
    }

    logAction(username, 'auth.login', 'user', user?.id, undefined, ip)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: SESSION_DURATION, path: '/',
    })
    return res
  } catch (err) {
    console.error('[login]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
