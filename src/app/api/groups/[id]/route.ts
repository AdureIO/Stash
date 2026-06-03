import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { canManageGroup } from "@/lib/space-access";
import { validateGroupRules } from "@/lib/user-admin";

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

	const group = db.groups.findById(groupId);
	if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
	return NextResponse.json({
		...group,
		members: db.groups.members(group.id),
		rules: db.groups.rules(group.id),
	});
}

export async function PATCH(req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	const session = await requirePanelAdmin().catch(() => null);
	if (!session || !actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	const groupId = Number(id);
	if (!canManageGroup(actor, groupId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const body = await req.json();
	const { name, description, memberIds, rules } = body as {
		name?: string;
		description?: string;
		memberIds?: number[];
		rules?: { repository: string; actions: string }[];
	};

	if (Array.isArray(rules)) {
		const validRules = rules
			.filter((r) => r?.repository?.trim())
			.map((r) => ({ repository: r.repository.trim(), actions: r.actions || "pull" }));
		if (!validateGroupRules(actor, validRules)) {
			return NextResponse.json({ error: "Rules are outside your scope" }, { status: 403 });
		}
		db.groups.syncRules(groupId, validRules);
	}

	const update: { name?: string; description?: string } = {};
	if (name !== undefined) update.name = name;
	if (description !== undefined) update.description = description;
	if (Object.keys(update).length) db.groups.update(groupId, update);
	if (Array.isArray(memberIds)) {
		const validUserIds = memberIds
			.map((uid) => Number(uid))
			.filter((uid) => Number.isInteger(uid) && uid > 0 && db.users.findById(uid));
		db.groups.setGroupMembers(groupId, validUserIds);
	}
	logAction(session.username, "group.update", "group", id, body);
	return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	const session = await requirePanelAdmin().catch(() => null);
	if (!session || !actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	const groupId = Number(id);
	if (!canManageGroup(actor, groupId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	db.groups.delete(groupId);
	logAction(session.username, "group.delete", "group", id);
	return NextResponse.json({ ok: true });
}
