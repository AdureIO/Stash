import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { parseDefaultGroupId, validateDefaultGroupId } from "@/lib/sso-groups";

interface Params {
	params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
	const session = await requireSuperAdmin().catch(() => null);
	if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	const body = await req.json();
	if (body.client_secret === "***") delete body.client_secret;

	if ("default_group_id" in body) {
		body.default_group_id = parseDefaultGroupId(body.default_group_id);
		const groupError = validateDefaultGroupId(body.default_group_id);
		if (groupError) return NextResponse.json({ error: groupError }, { status: 400 });
	}

	db.sso.update(Number(id), body);
	logAction(session.username, "sso.update", "sso_provider", id);
	return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
	const session = await requireSuperAdmin().catch(() => null);
	if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	db.sso.delete(Number(id));
	logAction(session.username, "sso.delete", "sso_provider", id);
	return NextResponse.json({ ok: true });
}
