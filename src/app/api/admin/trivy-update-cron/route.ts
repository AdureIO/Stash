import { NextRequest, NextResponse } from "next/server";
import { runTrivyUpdate } from "@/lib/trivy-update";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Called by scripts/cron.js — refreshes Trivy DBs and binary when TRIVY_VERSION changes. */
export async function POST(req: NextRequest) {
	if (req.headers.get("x-internal") !== "cron") {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const result = await runTrivyUpdate();
	if (!result.ok) {
		console.error("[trivy-update]", result.error, result.stderr);
		return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
	}

	return NextResponse.json({
		ok: true,
		message: result.stdout.split("\n").filter(Boolean).pop() ?? "updated",
	});
}
