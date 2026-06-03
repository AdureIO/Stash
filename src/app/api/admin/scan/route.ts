import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
	try {
		await requireSuperAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return NextResponse.json(db.scans.findAll());
}
