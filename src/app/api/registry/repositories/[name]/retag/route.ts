import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { getFeatures } from "@/lib/features";
import { retagManifest } from "@/lib/registry";
import { canManageResource, dockerResourceKeys } from "@/lib/access-control";

interface Params {
	params: Promise<{ name: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
	if (!getFeatures().docker) return NextResponse.json({ error: "Docker disabled" }, { status: 404 });
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { name } = await params;
	const repo = decodeURIComponent(name);
	if (!canManageResource(actor, dockerResourceKeys(repo))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const { sourceTag, targetTag } = (await req.json()) as { sourceTag?: string; targetTag?: string };
	if (!sourceTag || !targetTag) {
		return NextResponse.json({ error: "sourceTag and targetTag required" }, { status: 400 });
	}

	const ok = await retagManifest(repo, sourceTag, targetTag);
	if (!ok) return NextResponse.json({ error: "Retag failed" }, { status: 500 });

	return NextResponse.json({ ok: true });
}
