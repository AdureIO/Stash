import { NextRequest, NextResponse } from 'next/server'
import { login, SESSION_COOKIE, SESSION_DURATION } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const token = await login(username, password)
    if (!token) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION,
      path: '/',
    })
    return res
  } catch (err) {
    console.error('[login]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
