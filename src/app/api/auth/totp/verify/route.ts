import { NextRequest, NextResponse } from "next/server";
import { getSession, createSession, SESSION_COOKIE } from "@/lib/auth";
import { SESSION_DURATION, sessionCookieOptions } from "@/lib/session";
import { verifyTotpCode } from "@/lib/totp";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { code } = await req.json();
	const user = db.users.findById(session.userId);
	if (!user?.totp_enabled || !user.totp_secret) {
		return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
	}

	if (!verifyTotpCode(user.totp_secret, code)) {
		return NextResponse.json({ error: "Invalid code" }, { status: 401 });
	}

	// Re-issue session with totpVerified = true
	const newToken = await createSession({ ...session, totpVerified: true });
	const res = NextResponse.json({ ok: true });
	res.cookies.set(SESSION_COOKIE, newToken, sessionCookieOptions(SESSION_DURATION));
	return res;
}
