// Lightweight NPM registry
// Artifacts stored at $NPM_ROOT (default /data/npm)
// Auth via Bearer token (PAT) or Basic auth against users table
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { hashPat } from '@/lib/pat'
import { getFeatures } from '@/lib/features'
import { safePath, buildPackageMeta, writePackageVersion, NPM_ROOT } from '@/lib/npm-registry'
import bcrypt from 'bcryptjs'

async function authenticate(req: NextRequest) {
  const auth = req.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) {
    const raw = auth.slice(7)
    const token = db.tokens.findByHash(hashPat(raw))
    if (!token) return null
    if (token.expires_at && new Date(token.expires_at) < new Date()) return null
    db.tokens.touch(token.id)
    return db.users.findById(token.user_id) ?? null
  }
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString()
    const sep = decoded.indexOf(':')
    const username = decoded.slice(0, sep)
    const password = decoded.slice(sep + 1)
    const user = db.users.findByUsername(username)
    if (!user) return null
    const ok = await bcrypt.compare(password, user.password_hash)
    return ok ? user : null
  }
  return null
}

function unauthorized() {
  return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
  })
}

interface Params { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!getFeatures().npm) return new NextResponse('Not Found', { status: 404 })

  const { path: segments } = await params
  const joined = segments.join('/')
  const baseUrl = process.env.PUBLIC_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`

  // /-/ping
  if (joined === '-/ping') return NextResponse.json({})

  // /-/whoami — requires auth
  if (joined === '-/whoami') {
    const user = await authenticate(req)
    if (!user) return unauthorized()
    return NextResponse.json({ username: user.username })
  }

  // /@scope/pkg/-/tarball  or  /pkg/-/tarball
  const tarballMatch = joined.match(/^(.+)\/-\/(.+\.tgz)$/)
  if (tarballMatch) {
    const user = await authenticate(req)
    if (!user) return unauthorized()
    const pkgName = tarballMatch[1]
    const filename = tarballMatch[2]
    // Extract version from filename: pkg-1.0.0.tgz
    const versionMatch = filename.match(/^.+-(\d.+)\.tgz$/)
    const version = versionMatch?.[1] ?? ''
    const filePath = safePath([pkgName, version, filename])
    if (!filePath || !existsSync(filePath)) return new NextResponse('Not Found', { status: 404 })
    const content = readFileSync(filePath)
    return new NextResponse(content, { headers: { 'Content-Type': 'application/octet-stream' } })
  }

  // Package metadata: /@scope/pkg or /pkg
  const user = await authenticate(req)
  if (!user) return unauthorized()
  const pkgName = joined
  const meta = buildPackageMeta(pkgName, baseUrl)
  if (!meta) return new NextResponse(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  return NextResponse.json(meta)
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!getFeatures().npm) return new NextResponse('Not Found', { status: 404 })
  const user = await authenticate(req)
  if (!user) return unauthorized()
  if (user.role === 'viewer') return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  const { path: segments } = await params
  const joined = segments.join('/')

  // npm login: PUT /-/user/org.couchdb.user:username
  if (joined.startsWith('-/user/')) {
    const body = await req.json().catch(() => ({})) as { name?: string; password?: string }
    const loginUser = db.users.findByUsername(body.name || '')
    if (!loginUser) return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    const ok = body.password && await bcrypt.compare(body.password, loginUser.password_hash)
    if (!ok) return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    // Return a PAT as the npm token
    const { generatePat, hashPat: hp } = await import('@/lib/pat')
    const raw = generatePat()
    db.tokens.create(loginUser.id, 'npm-login', hp(raw), 'npm', undefined)
    return NextResponse.json({ ok: true, token: raw }, { status: 201 })
  }

  // Publish: PUT /pkgname
  const body = await req.json() as {
    name?: string; versions?: Record<string, Record<string, unknown>>
    _attachments?: Record<string, { data: string }>
  }

  const pkgName = body.name || joined
  const versions = body.versions || {}
  const attachments = body._attachments || {}

  for (const [version, pkgJson] of Object.entries(versions)) {
    const tgzName = `${pkgName.replace('/', '-')}-${version}.tgz`
    const attachment = attachments[tgzName]
    if (!attachment?.data) continue
    const tgzBuf = Buffer.from(attachment.data, 'base64')
    writePackageVersion(pkgName, version, tgzBuf, pkgJson)
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!getFeatures().npm) return new NextResponse('Not Found', { status: 404 })
  const user = await authenticate(req)
  if (!user || user.role !== 'admin') return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  const { path: segments } = await params
  const pkgPath = safePath(segments)
  if (!pkgPath || !existsSync(pkgPath)) return new NextResponse('Not Found', { status: 404 })
  const { rmSync } = await import('fs')
  rmSync(pkgPath, { recursive: true, force: true })
  return new NextResponse(null, { status: 204 })
}
