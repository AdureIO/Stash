import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from './lib/session'

const PUBLIC_PATHS = ['/login', '/api/auth/token', '/api/auth/login', '/api/webhook/events', '/v2', '/api/auth/sso', '/api/npm']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const session = await verifySession(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  // Require TOTP completion before accessing panel
  if (session.totpVerified === false && !pathname.startsWith('/login/totp') && !pathname.startsWith('/api/auth/totp/verify')) {
    return NextResponse.redirect(new URL('/login/totp', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
