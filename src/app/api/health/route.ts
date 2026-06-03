import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { createPrivateKey } from "crypto";
import { SignJWT } from "jose";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public diagnostics — no secrets exposed. Use after deploy to verify auth is wired correctly. */
export async function GET() {
	const checks: Record<string, unknown> = {
		public_url: process.env.PUBLIC_URL || null,
		registry_auth_realm: process.env.REGISTRY_AUTH_REALM || null,
		token_secret_set: Boolean(process.env.TOKEN_SECRET),
		auth_key_exists: existsSync(process.env.AUTH_KEY_PATH || "/data/auth.key"),
		auth_cert_exists: existsSync(process.env.AUTH_CERT_PATH || "/data/auth.crt"),
	};

	try {
		const row = getDb().prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
		checks.user_count = row.c;
	} catch (e) {
		checks.db_error = e instanceof Error ? e.message : String(e);
	}

	try {
		const pem = readFileSync(process.env.AUTH_KEY_PATH || "/data/auth.key", "utf-8");
		const key = createPrivateKey(pem);
		await new SignJWT({
			access: [{ type: "registry", name: "catalog", actions: ["*"] }],
		})
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer("registry-admin")
			.setAudience("docker-registry")
			.setExpirationTime("60s")
			.sign(key);
		checks.registry_jwt_sign = "ok";
	} catch (e) {
		checks.registry_jwt_sign = e instanceof Error ? e.message : String(e);
	}

	const ok = checks.registry_jwt_sign === "ok" && checks.token_secret_set === true && !checks.db_error;

	return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
