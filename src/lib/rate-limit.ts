// In-memory rate limiter — lightweight, no Redis needed for self-hosted
// Keyed by IP address. Evicts old entries automatically.

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Sweep expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (bucket.resetAt < now) store.delete(key)
  }
}, 300_000).unref()

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param key     Identifier (IP + endpoint)
 * @param limit   Max requests per window
 * @param windowMs Window size in ms (default 15 minutes)
 */
export function checkRateLimit(key: string, limit: number, windowMs = 900_000): boolean {
  const now = Date.now()
  let bucket = store.get(key)

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs }
    store.set(key, bucket)
  }

  bucket.count++
  return bucket.count <= limit
}

/** Clear a rate limit bucket (on successful login) */
export function clearRateLimit(key: string): void {
  store.delete(key)
}
