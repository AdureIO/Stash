import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session";

const PUBLIC_PATHS = [
	"/",
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

	if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
		return NextResponse.next();
	}

	const token = req.cookies.get(SESSION_COOKIE)?.value;
	if (!token) {
		return NextResponse.redirect(new URL("/login", req.url));
	}

	const session = await verifySession(token);
	if (!session) {
		const res = NextResponse.redirect(new URL("/login", req.url));
		res.cookies.delete(SESSION_COOKIE);
		return res;
	}

	// Require TOTP completion before accessing panel
	if (
		session.totpVerified === false &&
		!pathname.startsWith("/login/totp") &&
		!pathname.startsWith("/api/auth/totp/verify")
	) {
		return NextResponse.redirect(new URL("/login/totp", req.url));
	}

	return NextResponse.next();
}

export const config = {
	// Skip /v2 — Docker blob uploads must not pass through middleware body buffering.
	matcher: ["/((?!_next/static|_next/image|favicon.ico|v2).*)"],
};
