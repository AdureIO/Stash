// Docker Registry Token Auth Server (JWT/RS256)
// Supports: username/password AND Personal Access Tokens (PATs)
import { SignJWT } from "jose";
import { createPrivateKey, X509Certificate, type KeyObject } from "crypto";
import { readFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { db, type User } from "./db";
import { hashPat, PAT_PREFIX } from "./pat";
import bcrypt from "bcryptjs";
import { allowedActionsForResource, dockerResourceKeys, type RegistryAction } from "./access-control";

const ISSUER = "registry-admin";
const SERVICE = "docker-registry";
const TOKEN_EXPIRY = 3600;

let _privateKey: KeyObject | null = null;

function getPrivateKey(): KeyObject {
	if (_privateKey) return _privateKey;
	const pem = readFileSync(process.env.AUTH_KEY_PATH || "/data/auth.key", "utf-8");
	// Entrypoint generates PKCS#1 (BEGIN RSA PRIVATE KEY); createPrivateKey accepts both formats.
	_privateKey = createPrivateKey(pem);
	return _privateKey;
}

/** registry:2 verifies JWTs with libtrust — requires x5c, jwk, or kid in the header (alg alone is not enough). */
function getSigningCertX5c(): string[] {
	const pem = readFileSync(process.env.AUTH_CERT_PATH || "/data/auth.crt", "utf-8");
	const cert = new X509Certificate(pem);
	return [cert.raw.toString("base64")];
}

interface AccessEntry {
	type: string;
	name: string;
	actions: string[];
}

function parseScope(scope: string): AccessEntry | null {
	const parts = scope.split(":");
	if (parts.length < 3) return null;
	return {
		type: parts[0],
		name: parts.slice(1, -1).join(":"),
		actions: parts[parts.length - 1].split(",").filter(Boolean),
	};
}

const DEFAULT_LOGIN_SCOPE: AccessEntry[] = [{ type: "registry", name: "catalog", actions: ["*"] }];

function authorizeAccess(user: User, requested: AccessEntry[], patScope?: string): AccessEntry[] {
	const scopes = requested.length > 0 ? requested : DEFAULT_LOGIN_SCOPE;

	if (user.role === "superadmin") return scopes;

	const patActions = patScope ? new Set(patScope.split(",").map((s) => s.trim())) : null;

	return scopes.map((entry) => {
		// Docker login and /v2/_catalog use registry:catalog:* — required for docker login after auth
		if (entry.type === "registry" && entry.name === "catalog") {
			return { ...entry, actions: ["*"] };
		}

		if (entry.type !== "repository") return { ...entry, actions: [] };

		const allowed = allowedActionsForResource(user, dockerResourceKeys(entry.name));
		let finalActions = entry.actions.filter((a) => allowed.has(a as RegistryAction));
		if (patActions) finalActions = finalActions.filter((a) => patActions.has(a) || patActions.has("*"));

		return { ...entry, actions: finalActions };
	});
}

export interface TokenRequest {
	service: string;
	scope: string | null;
	offlineToken: boolean;
	clientId: string | null;
	username: string;
	password: string;
}

export interface TokenResponse {
	token: string;
	expires_in: number;
	issued_at: string;
}

export async function issueToken(req: TokenRequest): Promise<TokenResponse | null> {
	let user: User | undefined;
	let patScope: string | undefined;

	// PAT authentication: username is 'token' or password starts with PAT prefix
	const isPat = req.username === "token" || req.password.startsWith(PAT_PREFIX);
	if (isPat) {
		const hash = hashPat(req.password);
		const token = db.tokens.findByHash(hash);
		if (!token) return null;
		if (token.expires_at && new Date(token.expires_at) < new Date()) return null;
		user = db.users.findById(token.user_id);
		patScope = token.scope;
		if (user) db.tokens.touch(token.id);
	} else {
		user = db.users.findByUsername(req.username);
		if (!user) return null;
		const valid = await bcrypt.compare(req.password, user.password_hash);
		if (!valid) return null;
	}

	if (!user) return null;

	const scopes = req.scope ? (req.scope.split(" ").map(parseScope).filter(Boolean) as AccessEntry[]) : [];
	const access = authorizeAccess(user, scopes, patScope);
	const now = new Date();
	const privateKey = getPrivateKey();

	const token = await new SignJWT({ access, jti: uuidv4() })
		.setProtectedHeader({ alg: "RS256", x5c: getSigningCertX5c() })
		.setIssuer(ISSUER)
		.setSubject(user.username)
		.setAudience(SERVICE)
		.setIssuedAt(now)
		.setNotBefore(now)
		.setExpirationTime(`${TOKEN_EXPIRY}s`)
		.sign(privateKey);

	db.users.update(user.id, { last_login: now.toISOString() });
	return { token, expires_in: TOKEN_EXPIRY, issued_at: now.toISOString() };
}

/** Parse a single Docker registry scope string (e.g. `repository:foo/bar:pull`). */
export function scopesToAccess(scope: string): AccessEntry[] {
	const entry = parseScope(scope);
	return entry ? [entry] : [];
}

/** Issue a registry JWT for server-side UI/cron calls (no user session). */
export async function issueInternalRegistryToken(access: AccessEntry[]): Promise<string> {
	const fullAccess: AccessEntry[] = [{ type: "registry", name: "catalog", actions: ["*"] }];
	for (const entry of access) {
		if (entry.type === "repository") {
			fullAccess.push({
				type: "repository",
				name: entry.name,
				actions: ["pull", "push", "delete"],
			});
		} else {
			fullAccess.push(entry);
		}
	}
	const privateKey = getPrivateKey();
	const now = new Date();
	return new SignJWT({ access: fullAccess, jti: uuidv4() })
		.setProtectedHeader({ alg: "RS256", x5c: getSigningCertX5c() })
		.setIssuer(ISSUER)
		.setSubject("stash-internal")
		.setAudience(SERVICE)
		.setIssuedAt(now)
		.setNotBefore(now)
		.setExpirationTime(`${TOKEN_EXPIRY}s`)
		.sign(privateKey);
}
