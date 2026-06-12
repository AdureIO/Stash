import { Header } from "@/components/layout/header";
import { listRepositories, listTags, getManifest, getImageConfig } from "@/lib/registry";
import { pickLatestTag } from "@/lib/registry-tags";
import { db } from "@/lib/db";
import type { ScanInfo } from "./[name]/scan-status-badge";
import { getFeatures } from "@/lib/features";
import { redirect } from "next/navigation";
import { RepositoryList, type RepoSummary } from "./repository-list";
import { getActorUser, requireSession } from "@/lib/auth";
import { dockerResourceKeys, filterResourcesByViewAccess } from "@/lib/access-control";

export const dynamic = "force-dynamic";

async function getRepoSummaries(repos: string[]): Promise<RepoSummary[]> {
	const summaries = await Promise.all(
		repos.map(async (name) => {
			const tags = await listTags(name);
			let lastPush: string | null = null;
			let totalSize = 0;

			const latestTag = pickLatestTag(tags);
			let latestScan: ScanInfo | null = null;

			if (latestTag) {
				const m = await getManifest(name, latestTag);
				if (m) {
					totalSize = m.manifest.layers.reduce((s, l) => s + l.size, 0);
					const cfg = await getImageConfig(name, m.manifest.config.digest);
					lastPush = cfg?.created || null;
				}
				const scan = db.scans.findByRepo(name, latestTag);
				if (scan) {
					latestScan = {
						status: scan.status,
						critical: scan.critical,
						high: scan.high,
						medium: scan.medium,
						low: scan.low,
						scanned_at: scan.scanned_at,
					};
				}
			}

			if (!lastPush) {
				const events = db.events.findByRepo(name, 1);
				lastPush = events[0]?.timestamp || null;
			}

			return {
				name,
				tagCount: tags.length,
				lastPush,
				totalSize,
				latestTag: latestTag ?? null,
				latestScan,
			};
		}),
	);

	return summaries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export default async function RepositoriesPage() {
	if (!getFeatures().docker) redirect("/dashboard");
	try {
		await requireSession();
	} catch {
		redirect("/login");
	}
	const actor = await getActorUser();
	if (!actor) redirect("/login");
	let repos = await listRepositories();
	repos = filterResourcesByViewAccess(actor, repos, (name) => dockerResourceKeys(name));
	const summaries = await getRepoSummaries(repos);

	return (
		<div>
			<Header title="Images" subtitle={`${summaries.length} ${summaries.length === 1 ? "image" : "images"}`} />
			<RepositoryList repos={summaries} />
		</div>
	);
}
