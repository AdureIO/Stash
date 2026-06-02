import { createHash, randomBytes } from 'crypto'

export const PAT_PREFIX = 'ra_'

/** Generate a new raw PAT — returned once, never stored */
export function generatePat(): string {
  return PAT_PREFIX + randomBytes(32).toString('hex')
}

/** Deterministic hash for DB storage and lookup */
export function hashPat(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
