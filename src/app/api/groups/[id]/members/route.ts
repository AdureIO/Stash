import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageGroup } from "@/lib/space-access";

interface Params {
	params: Promise<{ id: string }>;
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
	const { userId } = await req.json();
	db.groups.addMember(groupId, Number(userId));
	return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
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
	const { userId } = await req.json();
	db.groups.removeMember(groupId, Number(userId));
	return NextResponse.json({ ok: true });
}
