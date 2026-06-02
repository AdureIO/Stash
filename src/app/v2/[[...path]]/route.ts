// Transparent proxy for the Docker Registry API
// Forwards /v2/* to the internal registry on 127.0.0.1:5000
// This keeps the registry fully internal — users only expose port 3000
import { NextRequest, NextResponse } from "next/server";
import { getFeatures } from "@/lib/features";

export const dynamic = "force-dynamic";

const REGISTRY = process.env.REGISTRY_URL || "http://127.0.0.1:5000";

function tokenRealm(): string | null {
	const fromEnv = process.env.REGISTRY_AUTH_REALM;
	if (fromEnv) return fromEnv.replace(/\/$/, "");
	const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
	return base ? `${base}/api/auth/token` : null;
}

function rewriteWwwAuthenticate(value: string): string {
	const realm = tokenRealm();
	if (!realm) return value;
	return value.replace(/realm="[^"]*"/i, `realm="${realm}"`);
}

function publicBase(req: NextRequest): string {
	const fromEnv = process.env.PUBLIC_URL?.replace(/\/$/, "");
	return fromEnv || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

/** Rewrite blob-upload Location headers from the internal registry URL to the public URL. */
function rewriteLocation(value: string, req: NextRequest): string {
	const registryBase = REGISTRY.replace(/\/$/, "");
	if (value.startsWith(registryBase)) {
		return publicBase(req) + value.slice(registryBase.length);
	}
	return value;
}

const STRIP_REQ = new Set(["host", "connection", "transfer-encoding"]);
const STRIP_RES = new Set(["connection", "transfer-encoding", "keep-alive"]);
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

async function proxy(req: NextRequest) {
	if (!getFeatures().docker) return new NextResponse(null, { status: 404 });

	// Use the request pathname so trailing slashes are preserved — Docker blob
	// uploads POST to /v2/<repo>/blobs/uploads/ and the registry 301-loops if
	// the slash is dropped when rebuilding from [[...path]] segments.
	const url = `${REGISTRY}${req.nextUrl.pathname}${req.nextUrl.search}`;

	const headers = new Headers();
	req.headers.forEach((v, k) => {
		if (!STRIP_REQ.has(k.toLowerCase())) headers.set(k, v);
	});

	const hasBody = BODY_METHODS.has(req.method);

	let upstream: Response;
	try {
		upstream = await fetch(url, {
			method: req.method,
			headers,
			body: hasBody ? req.body : undefined,
			// @ts-expect-error duplex needed for streaming request body in Node.js fetch
			duplex: hasBody ? "half" : undefined,
			redirect: "manual",
			cache: "no-store",
		});
	} catch {
		return new NextResponse("Registry unavailable", { status: 502 });
	}

	const resHeaders = new Headers();
	upstream.headers.forEach((v, k) => {
		const key = k.toLowerCase();
		if (STRIP_RES.has(key)) return;
		if (key === "www-authenticate") {
			resHeaders.set(k, rewriteWwwAuthenticate(v));
			return;
		}
		if (key === "location") {
			resHeaders.set(k, rewriteLocation(v, req));
			return;
		}
		resHeaders.set(k, v);
	});

	return new NextResponse(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: resHeaders,
	});
}

export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
