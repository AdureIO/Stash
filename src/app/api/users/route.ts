import { NextRequest, NextResponse } from "next/server";
import { getActorUser, requirePanelAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { filterUsersForActor } from "@/lib/space-access";
import { validateUserCreate } from "@/lib/user-admin";
import { USER_ROLES } from "@/lib/roles";

export async function GET() {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const users = filterUsersForActor(actor, db.users.findAll()).map((u) => ({
		...u,
		password_hash: undefined,
		rules: db.rules.findByUser(u.id),
		groups: db.groups.userGroups(u.id).map((g) => ({ id: g.id, name: g.name })),
	}));
	return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
	const actor = await getActorUser();
	try {
		await requirePanelAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { username, password, role, groupIds, default_access } = await req.json();
	if (!username || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

	const validated = validateUserCreate(actor, { role, groupIds });
	if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 403 });

	if (!USER_ROLES.includes(validated.role)) {
		return NextResponse.json({ error: "Invalid role" }, { status: 400 });
	}

	const defaultAccess = default_access === "allow" ? "allow" : "deny";
	if (db.users.findByUsername(username)) return NextResponse.json({ error: "Username taken" }, { status: 409 });
	const hash = await bcrypt.hash(password, 12);
	const result = db.users.create(username, hash, validated.role, defaultAccess);
	const userId = Number(result.lastInsertRowid);
	db.groups.setUserMemberships(userId, validated.groupIds);
	return NextResponse.json({ ok: true, id: userId }, { status: 201 });
}
