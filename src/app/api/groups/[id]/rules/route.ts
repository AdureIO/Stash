import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageGroup } from "@/lib/space-access";

interface Params {
	params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { id } = await params;
	const groupId = Number(id);
	if (!canManageGroup(actor, groupId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	return NextResponse.json(db.groups.rules(groupId));
}

export async function POST(req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { id } = await params;
	const groupId = Number(id);
	if (!canManageGroup(actor, groupId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { repository, actions } = await req.json();
	db.groups.addRule(groupId, repository || "*", actions || "pull");
	return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { ruleId, groupId } = await req.json();
	if (groupId && !canManageGroup(actor, Number(groupId))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	db.groups.deleteRule(Number(ruleId));
	return NextResponse.json({ ok: true });
}
