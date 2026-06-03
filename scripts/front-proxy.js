#!/usr/bin/env node
/**
 * Streams /v2/* directly to the embedded Docker registry without going through
 * Next.js. Next.js clones and buffers every request body (default 10MB cap),
 * which breaks large layer uploads and surfaces as nginx 499 / push failures.
 */
const http = require("node:http");
const { URL } = require("node:url");

const LISTEN_HOST = process.env.HOSTNAME || "0.0.0.0";
const LISTEN_PORT = Number(process.env.PORT || "3000");
const NEXT_UPSTREAM = (process.env.NEXT_UPSTREAM || "http://127.0.0.1:3001").replace(/\/$/, "");
const REGISTRY = (process.env.REGISTRY_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

const STRIP_REQ = new Set(["host", "connection", "transfer-encoding"]);
const STRIP_RES = new Set(["connection", "transfer-encoding", "keep-alive"]);

function tokenRealm() {
	const fromEnv = process.env.REGISTRY_AUTH_REALM;
	if (fromEnv) return fromEnv.replace(/\/$/, "");
	const base = process.env.PUBLIC_URL?.replace(/\/$/, "");
	return base ? `${base}/api/auth/token` : null;
}

function rewriteWwwAuthenticate(value) {
	const realm = tokenRealm();
	if (!realm) return value;
	return value.replace(/realm="[^"]*"/i, `realm="${realm}"`);
}

function publicBase(req) {
	const fromEnv = process.env.PUBLIC_URL?.replace(/\/$/, "");
	if (fromEnv) return fromEnv;
	const host = req.headers.host;
	if (!host) return "http://localhost";
	const proto =
		req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted ? "https" : "http";
	return `${proto}://${host}`;
}

function rewriteLocation(value, req) {
	if (value.startsWith(REGISTRY)) {
		return publicBase(req) + value.slice(REGISTRY.length);
	}
	return value;
}

function filterRequestHeaders(req, target) {
	const headers = { ...req.headers };
	for (const key of Object.keys(headers)) {
		if (STRIP_REQ.has(key.toLowerCase())) delete headers[key];
	}
	headers.host = target.host;
	if (target.port && target.port !== "80" && target.port !== "443") {
		headers.host = `${target.hostname}:${target.port}`;
	}
	return headers;
}

function filterResponseHeaders(headers, req) {
	const out = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (STRIP_RES.has(lower)) continue;
		if (lower === "www-authenticate") {
			out[key] = rewriteWwwAuthenticate(Array.isArray(value) ? value.join(", ") : String(value));
			continue;
		}
		if (lower === "location") {
			out[key] = rewriteLocation(Array.isArray(value) ? value[0] : String(value), req);
			continue;
		}
		out[key] = value;
	}
	return out;
}

function proxyHttp(clientReq, clientRes, targetBase) {
	const target = new URL(clientReq.url || "/", targetBase);
	const proxyReq = http.request(
		{
			protocol: target.protocol,
			hostname: target.hostname,
			port: target.port,
			path: target.pathname + target.search,
			method: clientReq.method,
			headers: filterRequestHeaders(clientReq, target),
		},
		(proxyRes) => {
			clientRes.writeHead(proxyRes.statusCode || 502, filterResponseHeaders(proxyRes.headers, clientReq));
			proxyRes.pipe(clientRes);
		},
	);

	proxyReq.on("error", (err) => {
		console.error("[front-proxy] upstream error:", err.message);
		if (!clientRes.headersSent) {
			clientRes.writeHead(502, { "Content-Type": "text/plain" });
		}
		clientRes.end("Registry unavailable");
	});

	clientReq.pipe(proxyReq);
	clientReq.on("error", () => proxyReq.destroy());
}

const server = http.createServer((req, res) => {
	const path = req.url?.split("?")[0] ?? "";
	if (path === "/v2" || path.startsWith("/v2/")) {
		proxyHttp(req, res, REGISTRY);
		return;
	}
	proxyHttp(req, res, NEXT_UPSTREAM);
});

server.on("clientError", (err, socket) => {
	if (socket.writable) {
		socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
	}
	console.error("[front-proxy] client error:", err.message);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
	console.log(
		`[front-proxy] listening on ${LISTEN_HOST}:${LISTEN_PORT} (registry=${REGISTRY}, next=${NEXT_UPSTREAM})`,
	);
});
