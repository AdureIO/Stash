import { NextRequest, NextResponse } from "next/server";
import { getActorUser, getSession } from "@/lib/auth";
import { canManageResource } from "@/lib/access-control";
import { scanFilesystem, parseTrivyReport, extractVulnerabilities } from "@/lib/trivy";
import { db } from "@/lib/db";
import { parseMavenArtifactCoords } from "@/lib/maven-utils";
import { resolvePrimaryArtifactFile } from "@/lib/maven-storage";
import { mavenScanRepository } from "@/lib/maven-scans";

export const maxDuration = 600;

interface Params {
	params: Promise<{ coords: string; version: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
	const actor = await getActorUser();
	if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const { coords, version } = await params;
	const parsed = parseMavenArtifactCoords(coords);
	if (!parsed) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

	const mavenKeys = [
		mavenScanRepository(parsed.groupId, parsed.artifactId),
		`maven:${parsed.groupId}:${parsed.artifactId}`,
	];
	if (!canManageResource(actor, mavenKeys)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const versionTag = decodeURIComponent(version);
	const scanRepo = mavenScanRepository(parsed.groupId, parsed.artifactId);
	const target = resolvePrimaryArtifactFile(parsed.groupId, parsed.artifactId, versionTag);

	if (!target) {
		return NextResponse.json({ error: "No scannable artifact file for this version" }, { status: 404 });
	}

	try {
		const result = await scanFilesystem(target);
		db.scans.insert({
			repository: scanRepo,
			tag: versionTag,
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
		db.scans.insert({
			repository: scanRepo,
			tag: versionTag,
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

	const { coords, version } = await params;
	const parsed = parseMavenArtifactCoords(coords);
	if (!parsed) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

	const scanRepo = mavenScanRepository(parsed.groupId, parsed.artifactId);
	const result = db.scans.findByRepo(scanRepo, decodeURIComponent(version));
	if (!result) return NextResponse.json({ error: "Not scanned yet" }, { status: 404 });

	if (result.status === "error") {
		return NextResponse.json({ ...result, error: result.raw_json });
	}

	let vulns: unknown[] = [];
	if (result.raw_json) {
		try {
			vulns = extractVulnerabilities(parseTrivyReport(result.raw_json));
		} catch {
			/* invalid stored JSON */
		}
	}

	return NextResponse.json({ ...result, vulns });
}
