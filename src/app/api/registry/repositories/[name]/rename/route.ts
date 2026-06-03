import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { getFeatures } from "@/lib/features";
import { listRepositories, renameRepository } from "@/lib/registry";
import { canManageResource, dockerResourceKeys } from "@/lib/access-control";

interface Params {
	params: Promise<{ name: string }>;
}

const REPO_NAME_RE = /^[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*$/;

export async function POST(req: NextRequest, { params }: Params) {
	if (!getFeatures().docker) return NextResponse.json({ error: "Docker disabled" }, { status: 404 });
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { name } = await params;
	const oldName = decodeURIComponent(name);
	const { newName } = (await req.json()) as { newName?: string };
	if (!newName || !REPO_NAME_RE.test(newName)) {
		return NextResponse.json({ error: "Invalid repository name" }, { status: 400 });
	}
	if (
		!canManageResource(actor, dockerResourceKeys(oldName)) ||
		!canManageResource(actor, dockerResourceKeys(newName))
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const repos = await listRepositories();
	if (!repos.includes(oldName)) {
		return NextResponse.json({ error: "Repository not found" }, { status: 404 });
	}
	if (repos.includes(newName)) {
		return NextResponse.json({ error: "Target name already exists" }, { status: 409 });
	}

	const result = await renameRepository(oldName, newName);
	if (result.copied === 0 && result.failed > 0) {
		return NextResponse.json({ error: "Rename failed", ...result }, { status: 500 });
	}

	return NextResponse.json({ ok: true, newName, ...result });
}
