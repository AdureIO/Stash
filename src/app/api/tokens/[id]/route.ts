import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAction } from "@/lib/audit";

interface Params {
	params: Promise<{ id: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const { id } = await params;
	// Admin can revoke any token; regular user only their own
	const userId = session.role === "superadmin" ? undefined : session.userId;
	db.tokens.delete(Number(id), userId);
	logAction(session.username, "token.delete", "token", id);
	return NextResponse.json({ ok: true });
}
