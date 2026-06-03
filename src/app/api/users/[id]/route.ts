import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { canManageUser, filterManageableGroupIds } from "@/lib/space-access";
import { validateUserAdminPatch } from "@/lib/user-admin";

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
	const userId = Number(id);
	if (!canManageUser(actor, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const user = db.users.findById(userId);
	if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const { password_hash: _omit, ...safe } = user;
	return NextResponse.json({
		...safe,
		groups: db.groups.userGroups(user.id).map((g) => ({ id: g.id, name: g.name })),
	});
}

export async function PATCH(req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	const userId = Number(id);
	const body = await req.json();
	const { role, password, groupIds, default_access } = body as {
		role?: string;
		password?: string;
		groupIds?: number[];
		default_access?: string;
	};

	const check = validateUserAdminPatch(actor, userId, { role, groupIds });
	if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });

	const update: Record<string, string> = {};
	if (role) update.role = role;
	if (default_access === "allow" || default_access === "deny") update.default_access = default_access;
	if (password) update.password_hash = await bcrypt.hash(password, 12);
	if (Object.keys(update).length) db.users.update(userId, update);
	if (Array.isArray(groupIds)) {
		const validIds = filterManageableGroupIds(
			actor,
			groupIds
				.map((gid) => Number(gid))
				.filter((gid) => Number.isInteger(gid) && gid > 0 && db.groups.findById(gid)),
		);
		db.groups.setUserMemberships(userId, validIds);
	}
	return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { id } = await params;
	const userId = Number(id);
	if (!canManageUser(actor, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (actor.id === userId) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

	db.users.delete(userId);
	return NextResponse.json({ ok: true });
}
