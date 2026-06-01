// Transparent proxy for the Docker Registry API
// Forwards /v2/* to the internal registry on 127.0.0.1:5000
// This keeps the registry fully internal — users only expose port 3000
import { NextRequest, NextResponse } from 'next/server'
import { getFeatures } from '@/lib/features'

export const dynamic = 'force-dynamic'

const REGISTRY = process.env.REGISTRY_URL || 'http://127.0.0.1:5000'

const STRIP_REQ  = new Set(['host', 'connection', 'transfer-encoding'])
const STRIP_RES  = new Set(['connection', 'transfer-encoding', 'keep-alive'])
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

async function proxy(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!getFeatures().docker) return new NextResponse(null, { status: 404 })

  const { path = [] } = await params
  const url = `${REGISTRY}/v2/${path.join('/')}${req.nextUrl.search}`

  const headers = new Headers()
  req.headers.forEach((v, k) => { if (!STRIP_REQ.has(k.toLowerCase())) headers.set(k, v) })

  const hasBody = BODY_METHODS.has(req.method)

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error duplex needed for streaming request body in Node.js fetch
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch {
    return new NextResponse('Registry unavailable', { status: 502 })
  }

  const resHeaders = new Headers()
  upstream.headers.forEach((v, k) => { if (!STRIP_RES.has(k.toLowerCase())) resHeaders.set(k, v) })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE }
