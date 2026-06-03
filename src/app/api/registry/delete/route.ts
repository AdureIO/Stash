import { NextRequest, NextResponse } from "next/server";
import { getActorUser } from "@/lib/auth";
import { deleteTag } from "@/lib/registry";
import { getFeatures } from "@/lib/features";
import { canManageResource, dockerResourceKeys } from "@/lib/access-control";

export async function DELETE(req: NextRequest) {
	if (!getFeatures().docker) return NextResponse.json({ error: "Docker disabled" }, { status: 404 });
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { repo, tag } = await req.json();
	if (!repo || !tag) return NextResponse.json({ error: "Missing repo or tag" }, { status: 400 });

	if (!canManageResource(actor, dockerResourceKeys(repo))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const ok = await deleteTag(repo, tag);
	if (!ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

	return NextResponse.json({ ok: true });
}
