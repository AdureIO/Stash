"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Tag, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list/list-toolbar";
import { compareDates, compareNumbers, compareStrings, useSortedFilteredList } from "@/hooks/use-sorted-filtered-list";
import { formatRelative, formatBytes } from "@/lib/utils";
import { mavenArtifactCoords, type MavenArtifactSummary } from "@/lib/maven-utils";
import { ScanStatusBadge, type ScanInfo } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { ScanVulnDialog } from "@/components/security/scan-vuln-dialog";
import { mavenScanApiPath } from "@/lib/maven-utils";

export interface MavenListItem extends MavenArtifactSummary {
	latestVersion: string | null;
	latestScan: ScanInfo | null;
}

function artifactName(a: MavenArtifactSummary) {
	return `${a.groupId}:${a.artifactId}`;
}

const SORT_OPTIONS = [
	{ id: "name", label: "Name" },
	{ id: "versions", label: "Versions" },
	{ id: "size", label: "Size" },
	{ id: "updated", label: "Last updated" },
] as const;

const COMPARATORS = {
	name: (a: MavenListItem, b: MavenListItem) => compareStrings(artifactName(a), artifactName(b)),
	versions: (a: MavenListItem, b: MavenListItem) => compareNumbers(a.versions.length, b.versions.length),
	size: (a: MavenListItem, b: MavenListItem) => compareNumbers(a.size, b.size),
	updated: (a: MavenListItem, b: MavenListItem) => compareDates(a.lastModified, b.lastModified),
};

function mavenSearchText(a: MavenListItem) {
	return `${a.groupId} ${a.artifactId} ${a.versions.join(" ")}`;
}

interface Props {
	artifacts: MavenListItem[];
}

function MavenRow({ artifact }: { artifact: MavenListItem }) {
	const [vulnOpen, setVulnOpen] = useState(false);
	const coords = mavenArtifactCoords(artifact.groupId, artifact.artifactId);
	const href = `/packages/${encodeURIComponent(coords)}`;
	const canViewVulns =
		artifact.latestVersion &&
		artifact.latestScan &&
		(artifact.latestScan.status === "ok" || artifact.latestScan.status === "error");

	return (
		<>
			<Link href={href}>
				<Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
					<div className="px-5 py-4 flex items-center justify-between gap-4">
						<div className="flex items-center gap-3 min-w-0">
							<div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
								<BookOpen size={16} className="text-blue-600" />
							</div>
							<div className="min-w-0">
								<code className="font-medium text-zinc-900 text-sm truncate block">
									{artifactName(artifact)}
								</code>
								<p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-3">
									<span className="flex items-center gap-1">
										<Tag size={10} /> {artifact.versions.length} version
										{artifact.versions.length !== 1 ? "s" : ""}
									</span>
									<span className="flex items-center gap-1">
										<Clock size={10} /> {formatRelative(artifact.lastModified)}
									</span>
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 flex-shrink-0">
							{artifact.latestScan ? (
								canViewVulns ? (
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setVulnOpen(true);
										}}
										className="inline-flex items-center rounded-md hover:bg-zinc-100 px-1 py-0.5 transition-colors"
										title="View latest version vulnerabilities"
									>
										<ScanStatusBadge scan={artifact.latestScan} />
									</button>
								) : (
									<ScanStatusBadge scan={artifact.latestScan} />
								)
							) : (
								<span className="text-[10px] text-zinc-400">latest · not scanned</span>
							)}
							{artifact.size > 0 && <Badge variant="default">{formatBytes(artifact.size)}</Badge>}
							<span className="text-zinc-300 text-sm">→</span>
						</div>
					</div>
				</Card>
			</Link>
			{canViewVulns && artifact.latestVersion && (
				<ScanVulnDialog
					open={vulnOpen}
					onClose={() => setVulnOpen(false)}
					repository={coords}
					tag={artifact.latestVersion}
					scanApiPath={mavenScanApiPath(coords, artifact.latestVersion)}
				/>
			)}
		</>
	);
}

export function MavenPackageList({ artifacts }: Props) {
	const list = useSortedFilteredList(artifacts, mavenSearchText, "name", COMPARATORS);

	if (artifacts.length === 0) {
		return (
			<Card>
				<div className="py-16 text-center">
					<BookOpen size={32} className="text-zinc-300 mx-auto mb-3" />
					<p className="text-zinc-500 text-sm">No packages yet</p>
					<p className="text-zinc-400 text-xs mt-1">Push a Maven artifact to get started</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-3">
			<ListToolbar
				search={list.search}
				onSearchChange={list.setSearch}
				searchPlaceholder="Filter artifacts…"
				sortId={list.sortId}
				onSortChange={list.setSortId}
				sortOptions={[...SORT_OPTIONS]}
				direction={list.direction}
				onToggleDirection={list.toggleDirection}
				visibleCount={list.visibleCount}
				totalCount={list.totalCount}
			/>

			{list.items.length === 0 ? (
				<Card>
					<div className="py-10 text-center text-sm text-zinc-400">No artifacts match your search</div>
				</Card>
			) : (
				<div className="grid gap-3">
					{list.items.map((a) => (
						<MavenRow key={`${a.groupId}:${a.artifactId}`} artifact={a} />
					))}
				</div>
			)}
		</div>
	);
}
