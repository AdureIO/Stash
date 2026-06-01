// Docker Registry Token Auth endpoint
// Called by Docker daemon when authenticating against the registry
import { NextRequest, NextResponse } from 'next/server'
import { issueToken } from '@/lib/token-auth'

export async function GET(req: NextRequest) {
  return handleTokenRequest(req)
}

export async function POST(req: NextRequest) {
  return handleTokenRequest(req)
}

async function handleTokenRequest(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const service = searchParams.get('service') || ''
  const scope = searchParams.get('scope')
  const offlineToken = searchParams.get('offline_token') === 'true'
  const clientId = searchParams.get('client_id')

  // Extract Basic auth credentials
  const authHeader = req.headers.get('Authorization') || ''
  let username = ''
  let password = ''

  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString()
    const colon = decoded.indexOf(':')
    username = decoded.slice(0, colon)
    password = decoded.slice(colon + 1)
  }

  if (!username || !password) {
    return NextResponse.json({ errors: [{ code: 'UNAUTHORIZED', message: 'credentials required' }] }, { status: 401 })
  }

  const result = await issueToken({ service, scope, offlineToken, clientId, username, password })

  if (!result) {
    return NextResponse.json(
      { errors: [{ code: 'UNAUTHORIZED', message: 'invalid credentials' }] },
      { status: 401 }
    )
  }

  return NextResponse.json(result)
}
