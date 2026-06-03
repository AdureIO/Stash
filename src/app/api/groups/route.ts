import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { filterGroupsForActor } from "@/lib/space-access";
import { validateGroupRules } from "@/lib/user-admin";

export async function GET() {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const groups = filterGroupsForActor(actor, db.groups.findAll()).map((g) => ({
		...g,
		members: db.groups.members(g.id),
		rules: db.groups.rules(g.id),
	}));
	return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
	const actor = await getActorUser();
	const session = await requirePanelAdmin().catch(() => null);
	if (!session || !actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { name, description, memberIds, rules } = await req.json();
	if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

	const validRules = Array.isArray(rules)
		? rules
				.filter((r: { repository?: string }) => r?.repository?.trim())
				.map((r: { repository: string; actions?: string }) => ({
					repository: r.repository.trim(),
					actions: r.actions || "pull",
				}))
		: [];

	if (!validateGroupRules(actor, validRules)) {
		return NextResponse.json({ error: "Rules are outside your scope" }, { status: 403 });
	}

	const result = db.groups.create(name, description);
	const groupId = Number(result.lastInsertRowid);
	if (Array.isArray(memberIds)) {
		const validUserIds = memberIds
			.map((uid: unknown) => Number(uid))
			.filter((uid) => Number.isInteger(uid) && uid > 0 && db.users.findById(uid));
		db.groups.setGroupMembers(groupId, validUserIds);
	}
	if (validRules.length) db.groups.syncRules(groupId, validRules);
	logAction(session.username, "group.create", "group", String(groupId), { name });
	return NextResponse.json({ ok: true, id: groupId }, { status: 201 });
}
