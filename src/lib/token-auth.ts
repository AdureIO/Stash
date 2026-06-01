// Docker Registry Token Auth Server (JWT/RS256)
// Spec: https://distribution.github.io/distribution/spec/auth/token/

import { SignJWT, importPKCS8 } from 'jose'
import { readFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { db, type User } from './db'
import bcrypt from 'bcryptjs'

const ISSUER = 'registry-admin'
const SERVICE = 'docker-registry'
const TOKEN_EXPIRY = 3600 // seconds

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null

async function getPrivateKey() {
  if (_privateKey) return _privateKey
  const keyPath = process.env.AUTH_KEY_PATH || '/data/auth.key'
  const pem = readFileSync(keyPath, 'utf-8')
  _privateKey = await importPKCS8(pem, 'RS256')
  return _privateKey
}

interface AccessEntry {
  type: string
  name: string
  actions: string[]
}

// Parse Docker scope string: "repository:myimage:pull,push"
function parseScope(scope: string): AccessEntry | null {
  const parts = scope.split(':')
  if (parts.length < 3) return null
  return {
    type: parts[0],
    name: parts.slice(1, -1).join(':'),
    actions: parts[parts.length - 1].split(',').filter(Boolean),
  }
}

// Filter requested actions based on what this user is allowed
function authorizeAccess(user: User, requested: AccessEntry[]): AccessEntry[] {
  if (user.role === 'admin') return requested

  const rules = db.rules.findByUser(user.id)

  return requested.map(entry => {
    if (entry.type !== 'repository') return { ...entry, actions: [] }

    const allowedActions = new Set<string>()

    for (const rule of rules) {
      const pattern = rule.repository
      const matches = pattern === '*' || pattern === entry.name ||
        (pattern.endsWith('/*') && entry.name.startsWith(pattern.slice(0, -2))) ||
        pattern === entry.name

      if (matches) {
        rule.actions.split(',').forEach(a => allowedActions.add(a.trim()))
      }
    }

    // role-based fallback
    if (user.role === 'push') {
      allowedActions.add('pull')
      allowedActions.add('push')
    } else if (user.role === 'viewer') {
      allowedActions.add('pull')
    }

    return {
      ...entry,
      actions: entry.actions.filter(a => allowedActions.has(a)),
    }
  })
}

export interface TokenRequest {
  service: string
  scope: string | null
  offlineToken: boolean
  clientId: string | null
  username: string
  password: string
}

export interface TokenResponse {
  token: string
  expires_in: number
  issued_at: string
}

export async function issueToken(req: TokenRequest): Promise<TokenResponse | null> {
  // Validate credentials
  const user = db.users.findByUsername(req.username)
  if (!user) return null

  const valid = await bcrypt.compare(req.password, user.password_hash)
  if (!valid) return null

  // Parse and authorize scopes
  const scopes = req.scope ? req.scope.split(' ').map(parseScope).filter(Boolean) as AccessEntry[] : []
  const access = authorizeAccess(user, scopes)

  const now = new Date()
  const privateKey = await getPrivateKey()

  const token = await new SignJWT({
    access,
    jti: uuidv4(),
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setSubject(user.username)
    .setAudience(SERVICE)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(`${TOKEN_EXPIRY}s`)
    .sign(privateKey)

  db.users.update(user.id, { last_login: now.toISOString() })

  return {
    token,
    expires_in: TOKEN_EXPIRY,
    issued_at: now.toISOString(),
  }
}
