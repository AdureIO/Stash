import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateTotpSecret, verifyTotpCode, totpQrDataUri } from '@/lib/totp'
import { db } from '@/lib/db'
import { logAction } from '@/lib/audit'

// GET — generate a new TOTP secret and return QR code (not yet saved)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const secret = generateTotpSecret()
  const qr = await totpQrDataUri(session.username, secret)
  // Temporarily store in settings to verify on POST
  db.settings.set(`totp_pending_${session.userId}`, secret)
  return NextResponse.json({ secret, qr })
}

// POST — verify code and permanently enable 2FA
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { code } = await req.json()
  const secret = db.settings.get(`totp_pending_${session.userId}`)
  if (!secret) return NextResponse.json({ error: 'No pending 2FA setup' }, { status: 400 })
  if (!verifyTotpCode(secret, code)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  db.users.update(session.userId, { totp_secret: secret, totp_enabled: 1 } as never)
  db.settings.set(`totp_pending_${session.userId}`, '') // clear pending
  logAction(session.username, 'totp.enable', 'user', session.userId)
  return NextResponse.json({ ok: true })
}

// DELETE — disable 2FA
export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  db.users.update(session.userId, { totp_secret: null, totp_enabled: 0 } as never)
  logAction(session.username, 'totp.disable', 'user', session.userId)
  return NextResponse.json({ ok: true })
}
