// Docker Registry Token Auth endpoint
// Called by Docker daemon when authenticating against the registry
import { NextRequest, NextResponse } from "next/server";
import { issueToken, issueAnonymousToken } from "@/lib/token-auth";

export async function GET(req: NextRequest) {
	return handleTokenRequest(req);
}

export async function POST(req: NextRequest) {
	return handleTokenRequest(req);
}

async function handleTokenRequest(req: NextRequest) {
	const { searchParams } = req.nextUrl;
	const service = searchParams.get("service") || "";
	const scope = searchParams.get("scope");
	const offlineToken = searchParams.get("offline_token") === "true";
	const clientId = searchParams.get("client_id");

	// Extract Basic auth credentials
	const authHeader = req.headers.get("Authorization") || "";
	let username = "";
	let password = "";

	if (authHeader.startsWith("Basic ")) {
		const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
		const colon = decoded.indexOf(":");
		username = decoded.slice(0, colon);
		password = decoded.slice(colon + 1);
	}

	if (!username || !password) {
		if (scope) {
			const anonymous = await issueAnonymousToken(scope);
			if (anonymous) return NextResponse.json(anonymous);
		}

		const realm =
			process.env.REGISTRY_AUTH_REALM ||
			(process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/auth/token` : "");
		const headers: Record<string, string> = {};
		if (realm) {
			headers["WWW-Authenticate"] = `Bearer realm="${realm}",service="docker-registry"`;
		}
		return NextResponse.json(
			{ errors: [{ code: "UNAUTHORIZED", message: "credentials required" }] },
			{ status: 401, headers },
		);
	}

	try {
		const result = await issueToken({ service, scope, offlineToken, clientId, username, password });

		if (!result) {
			return NextResponse.json(
				{ errors: [{ code: "UNAUTHORIZED", message: "invalid credentials" }] },
				{ status: 401 },
			);
		}

		return NextResponse.json(result);
	} catch (err) {
		console.error("[auth/token]", err);
		return NextResponse.json(
			{ errors: [{ code: "UNKNOWN", message: "token issuance failed" }] },
			{ status: 500 },
		);
	}
}
