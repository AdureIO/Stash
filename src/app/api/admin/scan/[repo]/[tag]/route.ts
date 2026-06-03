import { NextRequest, NextResponse } from "next/server";
import { getActorUser, getSession } from "@/lib/auth";
import { canManageResource, dockerResourceKeys } from "@/lib/access-control";
import { scanImage, parseTrivyReport, extractVulnerabilities } from "@/lib/trivy";
import { db } from "@/lib/db";
import { issueInternalRegistryToken } from "@/lib/token-auth";

export const maxDuration = 600;

interface Params {
	params: Promise<{ repo: string; tag: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	const { repo, tag } = await params;
	const repoName = decodeURIComponent(repo);
	if (!canManageResource(actor, dockerResourceKeys(repoName))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const registryUrl = process.env.REGISTRY_URL || "http://127.0.0.1:5000";

	try {
		const token = await issueInternalRegistryToken([{ type: "repository", name: repoName, actions: ["pull"] }]);
		const result = await scanImage(registryUrl, repoName, tag, token);
		db.scans.insert({
			repository: repoName,
			tag,
			digest: "",
			scanned_at: new Date().toISOString(),
			status: "ok",
			critical: result.critical,
			high: result.high,
			medium: result.medium,
			low: result.low,
			raw_json: result.raw,
		});
		return NextResponse.json({ ok: true, ...result, raw: undefined });
	} catch (e) {
		console.error(`[scan] ${repoName}:${tag} failed:`, e);
		db.scans.insert({
			repository: repoName,
			tag,
			digest: "",
			scanned_at: new Date().toISOString(),
			status: "error",
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			raw_json: (e as Error).message,
		});
		return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
	}
}

export async function GET(_req: NextRequest, { params }: Params) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	const { repo, tag } = await params;
	const result = db.scans.findByRepo(decodeURIComponent(repo), tag);
	if (!result) return NextResponse.json({ error: "Not scanned yet" }, { status: 404 });

	if (result.status === "error") {
		return NextResponse.json({ ...result, error: result.raw_json });
	}

	let vulns: unknown[] = [];
	if (result.raw_json) {
		try {
			vulns = extractVulnerabilities(parseTrivyReport(result.raw_json));
		} catch {
			/* stored raw_json was not valid JSON */
		}
	}

	return NextResponse.json({ ...result, vulns });
}
