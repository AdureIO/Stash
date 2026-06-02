// Lightweight Maven repository — GET / PUT / DELETE
// Stores artifacts under $MAVEN_ROOT (default /data/maven)
// Generates maven-metadata.xml and checksum files on the fly
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getFeatures } from '@/lib/features'

const MAVEN_ROOT = process.env.MAVEN_ROOT || '/data/maven'

// Resolve path safely — guards against path traversal attacks
function safe(segments: string[]): string | null {
  // Reject any segment containing traversal sequences
  if (segments.some(s => s.includes('..') || s.includes('\0'))) return null
  const root = path.resolve(MAVEN_ROOT)
  const resolved = path.resolve(root, ...segments)
  // Must be inside root (use '/' separator explicitly, not path.sep, for Docker containers)
  return resolved === root || resolved.startsWith(root + '/') ? resolved : null
}

async function authenticate(req: NextRequest) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Basic ')) return null
  const decoded = Buffer.from(auth.slice(6), 'base64').toString()
  const sep = decoded.indexOf(':')
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)
  const user = db.users.findByUsername(username)
  if (!user) return null
  const ok = await bcrypt.compare(password, user.password_hash)
  return ok ? user : null
}

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Maven Repository"' },
  })
}

// Generate maven-metadata.xml for an artifact directory
function mavenMetadata(artifactDir: string, segments: string[]): string {
  const artifactId = segments[segments.length - 1]
  const groupId = segments.slice(0, -1).join('.')

  let versions: string[] = []
  try {
    versions = readdirSync(artifactDir)
      .filter(f => { try { return statSync(path.join(artifactDir, f)).isDirectory() } catch { return false } })
      .sort()
  } catch { /* dir may not exist yet */ }

  const release = [...versions].filter(v => !v.includes('SNAPSHOT')).pop() ?? ''
  const latest = versions.at(-1) ?? ''
  const lastUpdated = new Date().toISOString().replace(/\D/g, '').slice(0, 14)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<metadata>',
    `  <groupId>${groupId}</groupId>`,
    `  <artifactId>${artifactId}</artifactId>`,
    '  <versioning>',
    `    <latest>${latest}</latest>`,
    `    <release>${release}</release>`,
    '    <versions>',
    ...versions.map(v => `      <version>${v}</version>`),
    '    </versions>',
    `    <lastUpdated>${lastUpdated}</lastUpdated>`,
    '  </versioning>',
    '</metadata>',
  ].join('\n')
}

// Compute checksum of a file
function checksum(filePath: string, algo: string): string {
  const normalised = algo === 'sha1' ? 'sha1' : algo === 'md5' ? 'md5' : algo.replace('-', '')
  return createHash(normalised).update(readFileSync(filePath)).digest('hex')
}

interface Params { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!getFeatures().maven) return new NextResponse('Not Found', { status: 404 })
  const { path: segments } = await params
  if (!segments?.length) return new NextResponse('Not Found', { status: 404 })

  const filePath = safe(segments)
  if (!filePath) return new NextResponse('Forbidden', { status: 403 })

  const filename = segments.at(-1)!

  // On-the-fly checksum files
  const checksumExt = filename.match(/\.(md5|sha1|sha256|sha512)$/)
  if (checksumExt) {
    const baseName = filename.slice(0, -checksumExt[0].length)
    const baseFile = safe([...segments.slice(0, -1), baseName])
    if (!baseFile || !existsSync(baseFile)) return new NextResponse('Not Found', { status: 404 })
    return new NextResponse(checksum(baseFile, checksumExt[1]), {
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // On-the-fly maven-metadata.xml
  if (filename === 'maven-metadata.xml') {
    const artifactDir = path.dirname(filePath)
    const xml = mavenMetadata(artifactDir, segments.slice(0, -1))
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } })
  }

  // Serve file
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const content = readFileSync(filePath)
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(content.length),
    },
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!getFeatures().maven) return new NextResponse('Not Found', { status: 404 })
  const user = await authenticate(req)
  if (!user) return unauthorized()
  if (user.role === 'viewer') return new NextResponse('Forbidden', { status: 403 })

  const { path: segments } = await params
  const filePath = safe(segments)
  if (!filePath) return new NextResponse('Forbidden', { status: 403 })

  mkdirSync(path.dirname(filePath), { recursive: true })

  const buf = await req.arrayBuffer()
  writeFileSync(filePath, Buffer.from(buf))

  return new NextResponse(null, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!getFeatures().maven) return new NextResponse('Not Found', { status: 404 })
  const user = await authenticate(req)
  if (!user || user.role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const { path: segments } = await params
  const filePath = safe(segments)
  if (!filePath || !existsSync(filePath)) return new NextResponse('Not Found', { status: 404 })

  unlinkSync(filePath)
  return new NextResponse(null, { status: 204 })
}
