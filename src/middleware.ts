import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session";

/** Prefixes for anonymous access. Do not use "/" here — every path starts with "/". */
const PUBLIC_PREFIXES = [
	"/login",
	"/portal",
	"/api/auth/token",
	"/api/auth/login",
	"/api/webhook/events",
	"/v2",
	"/api/auth/sso",
	"/api/npm",
	"/api/maven",
	"/api/health",
];

function isPublicPath(pathname: string): boolean {
	if (pathname === "/") return true;
	return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isApiPath(pathname: string): boolean {
	return pathname.startsWith("/api/");
}

function totpPendingAllowed(pathname: string): boolean {
	return (
		pathname === "/login/totp" ||
		pathname.startsWith("/api/auth/totp/verify") ||
		pathname.startsWith("/api/auth/logout")
	);
}

function denyUnauthenticated(req: NextRequest): NextResponse {
	if (isApiPath(req.nextUrl.pathname)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return NextResponse.redirect(new URL("/login", req.url));
}

function denyTotpRequired(req: NextRequest): NextResponse {
	if (isApiPath(req.nextUrl.pathname)) {
		return NextResponse.json({ error: "TOTP verification required" }, { status: 401 });
	}
	return NextResponse.redirect(new URL("/login/totp", req.url));
}

export async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;

	if (pathname === "/portal") {
		return NextResponse.redirect(new URL("/", req.url));
	}

	// Signed-in users should not see login screens
	const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
	if (sessionToken && (pathname === "/login" || pathname === "/login/totp")) {
		const session = await verifySession(sessionToken);
		if (session) {
			if (session.totpVerified === false) {
				if (pathname === "/login") {
					return NextResponse.redirect(new URL("/login/totp", req.url));
				}
			} else {
				return NextResponse.redirect(new URL("/dashboard", req.url));
			}
		}
	}

	if (req.headers.get("x-internal") === "cron") {
		if (
			pathname.startsWith("/api/admin/storage") ||
			pathname.startsWith("/api/admin/cleanup-cron") ||
			pathname.startsWith("/api/admin/trivy-update-cron")
		) {
			return NextResponse.next();
		}
	}

	if (isPublicPath(pathname)) {
		return NextResponse.next();
	}

	const token = req.cookies.get(SESSION_COOKIE)?.value;
	if (!token) {
		return denyUnauthenticated(req);
	}

	const session = await verifySession(token);
	if (!session) {
		const res = denyUnauthenticated(req);
		res.cookies.delete(SESSION_COOKIE);
		return res;
	}

	// Require TOTP completion before accessing panel or admin APIs
	if (session.totpVerified === false && !totpPendingAllowed(pathname)) {
		return denyTotpRequired(req);
	}

	return NextResponse.next();
}

export const config = {
	// Skip /v2 — Docker blob uploads must not pass through middleware body buffering.
	matcher: ["/((?!_next/static|_next/image|favicon.ico|v2).*)"],
};
