// Docker Registry Token Auth Server (JWT/RS256)
// Supports: username/password AND Personal Access Tokens (PATs)
import { SignJWT, importPKCS8 } from 'jose'
import { readFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { db, type User } from './db'
import { hashPat, PAT_PREFIX } from './pat'
import bcrypt from 'bcryptjs'

const ISSUER = 'registry-admin'
const SERVICE = 'docker-registry'
const TOKEN_EXPIRY = 3600

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null

async function getPrivateKey() {
  if (_privateKey) return _privateKey
  const pem = readFileSync(process.env.AUTH_KEY_PATH || '/data/auth.key', 'utf-8')
  _privateKey = await importPKCS8(pem, 'RS256')
  return _privateKey
}

interface AccessEntry { type: string; name: string; actions: string[] }

function parseScope(scope: string): AccessEntry | null {
  const parts = scope.split(':')
  if (parts.length < 3) return null
  return { type: parts[0], name: parts.slice(1, -1).join(':'), actions: parts[parts.length - 1].split(',').filter(Boolean) }
}

function repoMatches(pattern: string, name: string): boolean {
  if (pattern === '*') return true
  if (pattern === name) return true
  // Wildcard: org/* or org/team/*
  if (pattern.endsWith('/*')) return name.startsWith(pattern.slice(0, -2) + '/')
  // Deep wildcard: org/**
  if (pattern.endsWith('/**')) return name.startsWith(pattern.slice(0, -3) + '/')
  return false
}

function authorizeAccess(user: User, requested: AccessEntry[], patScope?: string): AccessEntry[] {
  if (user.role === 'admin') return requested

  // Collect all allowed actions from user rules + group rules
  const userRules = db.rules.findByUser(user.id)
  const groupRules = db.groups.allRulesForUser(user.id)
  const allRules = [...userRules, ...groupRules]

  // PAT scope restriction
  const patActions = patScope ? new Set(patScope.split(',').map(s => s.trim())) : null

  return requested.map(entry => {
    if (entry.type !== 'repository') return { ...entry, actions: [] }

    const allowedActions = new Set<string>()

    // Role-based defaults
    if (user.role === 'push') { allowedActions.add('pull'); allowedActions.add('push') }
    else if (user.role === 'viewer') { allowedActions.add('pull') }

    // Rule-based overrides
    for (const rule of allRules) {
      if (repoMatches(rule.repository, entry.name)) {
        rule.actions.split(',').forEach(a => allowedActions.add(a.trim()))
      }
    }

    // Intersect with PAT scope if applicable
    let finalActions = entry.actions.filter(a => allowedActions.has(a))
    if (patActions) finalActions = finalActions.filter(a => patActions.has(a) || patActions.has('*'))

    return { ...entry, actions: finalActions }
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
  let user: User | undefined
  let patScope: string | undefined

  // PAT authentication: username is 'token' or password starts with PAT prefix
  const isPat = req.username === 'token' || req.password.startsWith(PAT_PREFIX)
  if (isPat) {
    const hash = hashPat(req.password)
    const token = db.tokens.findByHash(hash)
    if (!token) return null
    if (token.expires_at && new Date(token.expires_at) < new Date()) return null
    user = db.users.findById(token.user_id)
    patScope = token.scope
    if (user) db.tokens.touch(token.id)
  } else {
    user = db.users.findByUsername(req.username)
    if (!user) return null
    const valid = await bcrypt.compare(req.password, user.password_hash)
    if (!valid) return null
  }

  if (!user) return null

  const scopes = req.scope ? req.scope.split(' ').map(parseScope).filter(Boolean) as AccessEntry[] : []
  const access = authorizeAccess(user, scopes, patScope)
  const now = new Date()
  const privateKey = await getPrivateKey()

  const token = await new SignJWT({ access, jti: uuidv4() })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER).setSubject(user.username).setAudience(SERVICE)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(`${TOKEN_EXPIRY}s`)
    .sign(privateKey)

  db.users.update(user.id, { last_login: now.toISOString() })
  return { token, expires_in: TOKEN_EXPIRY, issued_at: now.toISOString() }
}
