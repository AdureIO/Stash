import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RepositoryDetailView } from "./repository-detail-view";
import { getRepositoryDetail, listRepositories, listTags } from "@/lib/registry";
import { db } from "@/lib/db";
import { getActorUser } from "@/lib/auth";
import { canManageResource, dockerResourceKeys, userCanViewResource } from "@/lib/access-control";
import { formatBytes } from "@/lib/utils";
import type { ScanInfo } from "./scan-status-badge";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ name: string }>;
}

function buildScansByTag(repoName: string, tagNames: string[]): Record<string, ScanInfo> {
	const all = db.scans.findByRepository(repoName, 200);
	const byTag: Record<string, ScanInfo> = {};
	for (const tag of tagNames) {
		const latest = all.filter((s) => s.tag === tag).sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))[0];
		if (latest) {
			byTag[tag] = {
				status: latest.status,
				critical: latest.critical,
				high: latest.high,
				medium: latest.medium,
				low: latest.low,
				scanned_at: latest.scanned_at,
			};
		}
	}
	return byTag;
}

export default async function RepositoryDetailPage({ params }: Props) {
	const { name } = await params;
	const repoName = decodeURIComponent(name);
	const actor = await getActorUser();
	const keys = dockerResourceKeys(repoName);
	if (actor && !userCanViewResource(actor, keys)) notFound();
	const canManage = actor ? canManageResource(actor, keys) : false;

	const tags = await listTags(repoName);
	const repos = await listRepositories();
	if (!repos.includes(repoName) && tags.length === 0) notFound();

	const details = await getRepositoryDetail(repoName);
	const totalSize = details.reduce((s, t) => s + t.size, 0);
	const subtitle = `${tags.length} tags · ${formatBytes(totalSize)} total`;
	const lastPush =
		details.reduce<string | null>((latest, t) => {
			if (!t.created) return latest;
			if (!latest || t.created > latest) return t.created;
			return latest;
		}, null) ??
		db.events.findByRepo(repoName, 1)[0]?.timestamp ??
		null;

	const scansByTag = buildScansByTag(repoName, tags);
	const webhooks = db.webhooks.findForRepo(repoName);
	const eventStats = db.events.statsByRepo(repoName);
	const activityByAction = db.events.last30DaysByActionForRepo(repoName);
	const recentEvents = db.events.findByRepo(repoName, 15);

	return (
		<div>
			<Link
				href="/repositories"
				className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-4 transition-colors"
			>
				<ArrowLeft size={14} /> Images
			</Link>

			<RepositoryDetailView
				repoName={repoName}
				subtitle={subtitle}
				tagCount={tags.length}
				totalSize={totalSize}
				lastPush={lastPush}
				details={details}
				isAdmin={canManage}
				scansByTag={scansByTag}
				webhooks={webhooks}
				eventStats={eventStats}
				activityByAction={activityByAction}
				recentEvents={recentEvents}
			/>
		</div>
	);
}
