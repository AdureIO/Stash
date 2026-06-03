// Lightweight Maven repository — GET / PUT / DELETE
import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { db, type User } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getFeatures } from "@/lib/features";
import { resolveMavenGet, resolveMavenPath } from "@/lib/maven-repository";
import { canResourceAction, mavenResourceKeys } from "@/lib/access-control";

const MAVEN_ROOT = process.env.MAVEN_ROOT || "/data/maven";

async function authenticate(req: NextRequest): Promise<User | null> {
	const auth = req.headers.get("Authorization") || "";
	if (!auth.startsWith("Basic ")) return null;
	const decoded = Buffer.from(auth.slice(6), "base64").toString();
	const sep = decoded.indexOf(":");
	const username = decoded.slice(0, sep);
	const password = decoded.slice(sep + 1);
	const user = db.users.findByUsername(username);
	if (!user) return null;
	const ok = await bcrypt.compare(password, user.password_hash);
	return ok ? user : null;
}

function unauthorized() {
	return new NextResponse("Unauthorized", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Maven Repository"' },
	});
}

function forbidden() {
	return new NextResponse("Forbidden", { status: 403 });
}

function mavenAccess(user: User, segments: string[], action: "pull" | "push" | "delete"): boolean {
	return canResourceAction(user, mavenResourceKeys(segments), action);
}

interface Params {
	params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, { params }: Params) {
	if (!getFeatures().maven) return new NextResponse("Not Found", { status: 404 });
	const user = await authenticate(req);
	if (!user) return unauthorized();

	const { path: segments } = await params;
	if (!mavenAccess(user, segments ?? [], "pull")) return forbidden();

	const result = resolveMavenGet(segments ?? [], MAVEN_ROOT);

	switch (result.kind) {
		case "forbidden":
			return forbidden();
		case "not-found":
			return new NextResponse("Not Found", { status: 404 });
		case "checksum":
			return new NextResponse(result.body, { headers: { "Content-Type": "text/plain" } });
		case "metadata":
			return new NextResponse(result.body, { headers: { "Content-Type": "application/xml" } });
		case "file":
			return new NextResponse(new Uint8Array(result.body), {
				headers: {
					"Content-Type": "application/octet-stream",
					"Content-Length": String(result.contentLength),
				},
			});
	}
}

export async function PUT(req: NextRequest, { params }: Params) {
	if (!getFeatures().maven) return new NextResponse("Not Found", { status: 404 });
	const user = await authenticate(req);
	if (!user) return unauthorized();

	const { path: segments } = await params;
	if (!mavenAccess(user, segments ?? [], "push")) return forbidden();

	const filePath = resolveMavenPath(segments ?? [], MAVEN_ROOT);
	if (!filePath) return forbidden();

	mkdirSync(path.dirname(filePath), { recursive: true });

	const buf = await req.arrayBuffer();
	writeFileSync(filePath, Buffer.from(buf));

	return new NextResponse(null, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
	if (!getFeatures().maven) return new NextResponse("Not Found", { status: 404 });
	const user = await authenticate(req);
	if (!user) return unauthorized();

	const { path: segments } = await params;
	if (!mavenAccess(user, segments ?? [], "delete")) return forbidden();

	const filePath = resolveMavenPath(segments ?? [], MAVEN_ROOT);
	if (!filePath || !existsSync(filePath)) return new NextResponse("Not Found", { status: 404 });

	unlinkSync(filePath);
	return new NextResponse(null, { status: 204 });
}
