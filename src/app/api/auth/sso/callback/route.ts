import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCode, fetchUserInfo, isDomainAllowed } from "@/lib/sso";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { SESSION_DURATION, sessionCookieOptions } from "@/lib/session";
import { logAction } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
	const { searchParams } = req.nextUrl;
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");

	if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
	if (!code || !state) return NextResponse.redirect(new URL("/login?error=missing_params", req.url));

	const stateRow = db.sso.consumeState(state);
	if (!stateRow) return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));

	const provider = db.sso.findById(stateRow.provider_id);
	if (!provider) return NextResponse.redirect(new URL("/login?error=provider_not_found", req.url));

	const baseUrl = process.env.PUBLIC_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
	const redirectUri = `${baseUrl}/api/auth/sso/callback`;

	let email: string, name: string, emailVerified: boolean;
	try {
		const accessToken = await exchangeCode(provider, code, redirectUri);
		const info = await fetchUserInfo(provider, accessToken);
		email = info.email;
		name = info.name;
		emailVerified = info.emailVerified;
	} catch (e) {
		console.error("[sso]", e);
		return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
	}

	// Reject unverified emails when the provider exposes the flag
	if (!emailVerified) {
		return NextResponse.redirect(new URL("/login?error=email_not_verified", req.url));
	}

	if (!isDomainAllowed(email, provider.domain_whitelist)) {
		return NextResponse.redirect(new URL("/login?error=domain_not_allowed", req.url));
	}

	// Find or create user
	let user = db.users.findByUsername(email);
	if (!user) {
		const tempHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 4);
		db.users.create(email, tempHash, provider.default_role as never);
		user = db.users.findByUsername(email)!;
		logAction(email, "user.sso_create", "user", user.id, { provider: provider.name, name });
	}

	db.users.update(user.id, { last_login: new Date().toISOString() });
	logAction(email, "user.sso_login", "user", user.id, { provider: provider.name });

	// If user has TOTP enabled, SSO does not satisfy the second factor —
	// issue a partial session and redirect to TOTP verification
	const totpVerified = !user.totp_enabled;
	const token = await createSession({ userId: user.id, username: user.username, role: user.role, totpVerified });
	const res = NextResponse.redirect(new URL("/", req.url));
	res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_DURATION));
	return res;
}
