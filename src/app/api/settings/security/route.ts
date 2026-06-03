import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFeatures } from "@/lib/features";

const SETTING_KEY = "AUTO_SCAN_ON_PUSH";

export async function GET() {
	try {
		await requireSuperAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return NextResponse.json({
		autoScanOnPush: db.settings.get(SETTING_KEY) === "true",
		dockerEnabled: getFeatures().docker,
	});
}

export async function POST(req: NextRequest) {
	try {
		await requireSuperAdmin();
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const { autoScanOnPush } = (await req.json()) as { autoScanOnPush?: boolean };
	db.settings.set(SETTING_KEY, autoScanOnPush ? "true" : "false");
	return NextResponse.json({ autoScanOnPush: !!autoScanOnPush });
}
