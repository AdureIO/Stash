// Safe fetch wrapper — always returns { ok, data, error }
// Prevents "Unexpected end of JSON input" from empty error responses
export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, options)
    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (res.ok) {
      const data = isJson ? (await res.json() as T) : undefined
      return { ok: true, data }
    }

    let error = `Request failed (${res.status})`
    if (isJson) {
      try {
        const body = await res.json() as { error?: string }
        error = body.error || error
      } catch { /* ignore */ }
    }
    return { ok: false, error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
