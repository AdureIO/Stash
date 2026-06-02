// Custom OAuth2 / OIDC flow — no external library
import type { SsoProvider } from './db'

interface DiscoveryDoc {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

const discoveryCache = new Map<string, DiscoveryDoc>()

async function discover(issuerUrl: string): Promise<DiscoveryDoc> {
  if (discoveryCache.has(issuerUrl)) return discoveryCache.get(issuerUrl)!
  const url = issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`)
  const doc = await res.json() as DiscoveryDoc
  discoveryCache.set(issuerUrl, doc)
  return doc
}

const PROVIDER_DEFAULTS: Record<string, Partial<SsoProvider>> = {
  google: {
    authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    userinfo_url: 'https://www.googleapis.com/oauth2/v3/userinfo',
  },
  github: {
    authorization_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    userinfo_url: 'https://api.github.com/user',
  },
  gitlab: {
    authorization_url: 'https://gitlab.com/oauth/authorize',
    token_url: 'https://gitlab.com/oauth/token',
    userinfo_url: 'https://gitlab.com/oauth/userinfo',
  },
}

export async function buildAuthUrl(provider: SsoProvider, redirectUri: string, state: string): Promise<string> {
  let authUrl = provider.authorization_url

  if (!authUrl) {
    if (provider.type === 'oidc' && provider.issuer_url) {
      const doc = await discover(provider.issuer_url)
      authUrl = doc.authorization_endpoint
    } else {
      authUrl = PROVIDER_DEFAULTS[provider.type]?.authorization_url ?? ''
    }
  }

  const params = new URLSearchParams({
    client_id: provider.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: provider.type === 'github' ? 'user:email read:user' : 'openid email profile',
    state,
    ...(provider.type === 'google' ? { access_type: 'online', prompt: 'select_account' } : {}),
  })

  return `${authUrl}?${params}`
}

export async function exchangeCode(
  provider: SsoProvider, code: string, redirectUri: string
): Promise<string> {
  let tokenUrl = provider.token_url
  if (!tokenUrl) {
    if (provider.type === 'oidc' && provider.issuer_url) {
      tokenUrl = (await discover(provider.issuer_url)).token_endpoint
    } else {
      tokenUrl = PROVIDER_DEFAULTS[provider.type]?.token_url ?? ''
    }
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: provider.client_id, client_secret: provider.client_secret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const data = await res.json() as { access_token?: string }
  if (!data.access_token) throw new Error('No access_token in response')
  return data.access_token
}

export async function fetchUserInfo(
  provider: SsoProvider, accessToken: string
): Promise<{ email: string; name: string; emailVerified: boolean }> {
  let userInfoUrl = provider.userinfo_url
  if (!userInfoUrl) {
    if (provider.type === 'oidc' && provider.issuer_url) {
      userInfoUrl = (await discover(provider.issuer_url)).userinfo_endpoint
    } else {
      userInfoUrl = PROVIDER_DEFAULTS[provider.type]?.userinfo_url ?? ''
    }
  }

  const res = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Userinfo failed: ${res.status}`)
  const data = await res.json() as Record<string, unknown>

  // GitHub: fetch verified primary email explicitly
  if (provider.type === 'github') {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (emailRes.ok) {
      const emails = await emailRes.json() as { email: string; primary: boolean; verified: boolean }[]
      const primary = emails.find(e => e.primary && e.verified)
      if (primary) {
        data.email = primary.email
        data.email_verified = true
      } else {
        // No verified primary — block login
        data.email = emails[0]?.email ?? ''
        data.email_verified = false
      }
    }
  }

  const email = String(data.email || data.mail || '')
  const name = String(data.name || data.login || data.preferred_username || email.split('@')[0])

  // email_verified: honour the claim if present; default true for providers that
  // don't expose it (Google always verifies, GitLab OIDC sets it explicitly)
  const emailVerified = data.email_verified !== undefined ? Boolean(data.email_verified) : true

  return { email, name, emailVerified }
}

export function isDomainAllowed(email: string, domainWhitelist: string | null): boolean {
  if (!domainWhitelist) return true
  const domain = email.split('@')[1]?.toLowerCase()
  return domainWhitelist.split(',').map(d => d.trim().toLowerCase()).includes(domain)
}
