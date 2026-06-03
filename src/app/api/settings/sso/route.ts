import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { parseDefaultGroupId, validateDefaultGroupId } from "@/lib/sso-groups";

export async function GET() {
	try {
		await requireSuperAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const providers = db.sso.findAll().map((p) => {
		const group = p.default_group_id ? db.groups.findById(p.default_group_id) : null;
		return {
			...p,
			client_secret: "***",
			default_group_name: group?.name ?? null,
		};
	});
	return NextResponse.json(providers);
}

export async function POST(req: NextRequest) {
	const session = await requireSuperAdmin().catch(() => null);
	if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const body = await req.json();
	const default_group_id = parseDefaultGroupId(body.default_group_id);
	const groupError = validateDefaultGroupId(default_group_id);
	if (groupError) return NextResponse.json({ error: groupError }, { status: 400 });

	db.sso.create({
		name: body.name,
		type: body.type,
		client_id: body.client_id,
		client_secret: body.client_secret,
		issuer_url: body.issuer_url || null,
		authorization_url: body.authorization_url || null,
		token_url: body.token_url || null,
		userinfo_url: body.userinfo_url || null,
		domain_whitelist: body.domain_whitelist || null,
		default_role: body.default_role || "viewer",
		default_group_id,
		active: body.active ?? 1,
	});

	logAction(session.username, "sso.create", "sso_provider", undefined, {
		name: body.name,
		type: body.type,
		default_group_id,
	});
	return NextResponse.json({ ok: true }, { status: 201 });
}
