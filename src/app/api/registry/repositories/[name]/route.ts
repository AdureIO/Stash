import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { getFeatures } from "@/lib/features";
import { deleteRepository } from "@/lib/registry";
import { canManageResource, dockerResourceKeys } from "@/lib/access-control";

interface Params {
	params: Promise<{ name: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
	if (!getFeatures().docker) return NextResponse.json({ error: "Docker disabled" }, { status: 404 });
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { name } = await params;
	const repo = decodeURIComponent(name);
	if (!canManageResource(actor, dockerResourceKeys(repo))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const result = await deleteRepository(repo);
	if (result.failed > 0) {
		return NextResponse.json(
			{ ok: false, error: `Could not fully delete image (${result.failed} tag(s) remaining)`, ...result },
			{ status: 500 },
		);
	}
	return NextResponse.json({ ok: true, ...result });
}
