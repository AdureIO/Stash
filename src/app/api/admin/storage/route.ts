import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRepositories, getRepositorySize } from "@/lib/registry";
import { getFeatures } from "@/lib/features";
import { dirSize, getDiskBreakdown } from "@/lib/disk-usage";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const refresh = req.nextUrl.searchParams.get("refresh") === "1";
	const isInternalCron = req.headers.get("x-internal") === "cron";

	// Return cached unless refresh requested
	if (!refresh && !isInternalCron) {
		const cached = db.storage.latest();
		if (cached.length > 0) {
			const dockerLogical = db.storage.totalByType().find((t) => t.registry_type === "docker")?.total ?? 0;
			return NextResponse.json({
				snapshots: cached,
				totals: db.storage.totalByType(),
				breakdown: getDiskBreakdown(dockerLogical),
				cached: true,
			});
		}
	}

	const features = getFeatures();

	// Docker
	if (features.docker) {
		const repos = await listRepositories();
		for (const repo of repos) {
			const size = await getRepositorySize(repo);
			db.storage.upsert(repo, "docker", size, 0);
		}
	}

	// Maven
	if (features.maven) {
		const mavenRoot = process.env.MAVEN_ROOT || "/data/maven";
		if (existsSync(mavenRoot)) {
			for (const entry of readdirSync(mavenRoot)) {
				const full = path.join(mavenRoot, entry);
				if (statSync(full).isDirectory()) db.storage.upsert(entry, "maven", dirSize(full), 0);
			}
		}
	}

	// NPM
	if (features.npm) {
		const npmRoot = process.env.NPM_ROOT || "/data/npm";
		if (existsSync(npmRoot)) {
			for (const entry of readdirSync(npmRoot)) {
				const full = path.join(npmRoot, entry);
				if (statSync(full).isDirectory()) db.storage.upsert(entry, "npm", dirSize(full), 0);
			}
		}
	}

	const totals = db.storage.totalByType();
	const dockerLogical = totals.find((t) => t.registry_type === "docker")?.total ?? 0;

	return NextResponse.json({
		snapshots: db.storage.latest(),
		totals,
		breakdown: getDiskBreakdown(dockerLogical),
		cached: false,
	});
}
