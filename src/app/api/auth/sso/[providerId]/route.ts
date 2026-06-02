import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildAuthUrl } from '@/lib/sso'
import { randomBytes } from 'crypto'

interface Params { params: Promise<{ providerId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { providerId } = await params
  const provider = db.sso.findById(Number(providerId))
  if (!provider || !provider.active) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const state = randomBytes(16).toString('hex')
  db.sso.saveState(state, provider.id)

  const baseUrl = process.env.PUBLIC_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`
  const redirectUri = `${baseUrl}/api/auth/sso/callback`
  const authUrl = await buildAuthUrl(provider, redirectUri, state)

  return NextResponse.redirect(authUrl)
}
