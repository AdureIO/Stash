import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { canManageResource, dockerResourceKeys, mavenResourceKeys, npmResourceKeys } from "@/lib/access-control";
import { logAction } from "@/lib/audit";
import type { RegistryType } from "@/lib/db";
import {
	dockerVisibilityKey,
	mavenVisibilityKey,
	npmVisibilityKey,
	setResourcePublic,
	isResourcePublic,
} from "@/lib/visibility";
import { parseMavenArtifactCoords } from "@/lib/maven-utils";

function resolveResourceKeys(registryType: RegistryType, resourceKey: string): string[] {
	if (registryType === "docker") return dockerResourceKeys(resourceKey);
	if (registryType === "maven") {
		const parsed = parseMavenArtifactCoords(resourceKey.replace(/^maven:/, ""));
		if (!parsed) return [resourceKey];
		return [
			mavenVisibilityKey(parsed.groupId, parsed.artifactId),
			`maven:${parsed.groupId}:${parsed.artifactId}`,
		];
	}
	return npmResourceKeys(resourceKey);
}

function normalizeResourceKey(registryType: RegistryType, resourceKey: string): string | null {
	if (registryType === "docker") return dockerVisibilityKey(resourceKey);
	if (registryType === "maven") {
		if (resourceKey.startsWith("maven:")) return resourceKey;
		const parsed = parseMavenArtifactCoords(resourceKey);
		if (!parsed) return null;
		return mavenVisibilityKey(parsed.groupId, parsed.artifactId);
	}
	if (registryType === "npm") return npmVisibilityKey(resourceKey);
	return null;
}

export async function GET(req: NextRequest) {
	const { searchParams } = req.nextUrl;
	const registryType = searchParams.get("registryType") as RegistryType | null;
	const resourceKey = searchParams.get("resourceKey");

	if (registryType && resourceKey) {
		const key = normalizeResourceKey(registryType, resourceKey);
		if (!key) return NextResponse.json({ error: "Invalid resource key" }, { status: 400 });
		return NextResponse.json({ public: isResourcePublic(registryType, key) });
	}

	return NextResponse.json({ error: "registryType and resourceKey required" }, { status: 400 });
}

export async function PUT(req: NextRequest) {
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	let body: { registryType?: RegistryType; resourceKey?: string; isPublic?: boolean };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { registryType, resourceKey, isPublic } = body;
	if (!registryType || !resourceKey || typeof isPublic !== "boolean") {
		return NextResponse.json({ error: "registryType, resourceKey, and isPublic required" }, { status: 400 });
	}
	if (registryType !== "docker" && registryType !== "maven" && registryType !== "npm") {
		return NextResponse.json({ error: "Invalid registryType" }, { status: 400 });
	}

	const key = normalizeResourceKey(registryType, resourceKey);
	if (!key) return NextResponse.json({ error: "Invalid resource key" }, { status: 400 });

	if (!canManageResource(actor, resolveResourceKeys(registryType, key))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	setResourcePublic(registryType, key, isPublic, actor.username);
	logAction(
		actor.username,
		isPublic ? "resource.make_public" : "resource.make_private",
		registryType,
		key,
		{ isPublic },
		req.headers.get("x-forwarded-for") || undefined,
	);

	return NextResponse.json({ public: isPublic });
}
