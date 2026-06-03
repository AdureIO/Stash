"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Tag, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list/list-toolbar";
import { compareDates, compareNumbers, compareStrings, useSortedFilteredList } from "@/hooks/use-sorted-filtered-list";
import { formatRelative, formatBytes } from "@/lib/utils";
import { ScanStatusBadge, type ScanInfo } from "./[name]/scan-status-badge";
import { ScanVulnDialog } from "@/components/security/scan-vuln-dialog";

export interface RepoSummary {
	name: string;
	tagCount: number;
	lastPush: string | null;
	totalSize: number;
	latestTag: string | null;
	latestScan: ScanInfo | null;
}

const SORT_OPTIONS = [
	{ id: "name", label: "Name" },
	{ id: "tags", label: "Tags" },
	{ id: "size", label: "Size" },
	{ id: "updated", label: "Last updated" },
] as const;

const COMPARATORS = {
	name: (a: RepoSummary, b: RepoSummary) => compareStrings(a.name, b.name),
	tags: (a: RepoSummary, b: RepoSummary) => compareNumbers(a.tagCount, b.tagCount),
	size: (a: RepoSummary, b: RepoSummary) => compareNumbers(a.totalSize, b.totalSize),
	updated: (a: RepoSummary, b: RepoSummary) => compareDates(a.lastPush, b.lastPush),
};

function repoSearchText(r: RepoSummary) {
	return r.name;
}

interface Props {
	repos: RepoSummary[];
}

function RepoRow({ repo }: { repo: RepoSummary }) {
	const [vulnOpen, setVulnOpen] = useState(false);
	const canViewVulns =
		repo.latestTag && repo.latestScan && (repo.latestScan.status === "ok" || repo.latestScan.status === "error");

	return (
		<>
			<Link href={`/repositories/${encodeURIComponent(repo.name)}`}>
				<Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
					<div className="px-5 py-4 flex items-center justify-between gap-4">
						<div className="flex items-center gap-3 min-w-0">
							<div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
								<Package size={16} className="text-blue-600" />
							</div>
							<div className="min-w-0">
								<p className="font-medium text-zinc-900 text-sm">{repo.name}</p>
								<p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-3">
									<span className="flex items-center gap-1">
										<Tag size={10} /> {repo.tagCount} tags
									</span>
									<span className="flex items-center gap-1">
										<Clock size={10} /> {formatRelative(repo.lastPush)}
									</span>
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 flex-shrink-0">
							{repo.latestScan ? (
								canViewVulns ? (
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setVulnOpen(true);
										}}
										className="inline-flex items-center rounded-md hover:bg-zinc-100 px-1 py-0.5 transition-colors"
										title="View latest tag vulnerabilities"
									>
										<ScanStatusBadge scan={repo.latestScan} />
									</button>
								) : (
									<ScanStatusBadge scan={repo.latestScan} />
								)
							) : (
								<span className="text-[10px] text-zinc-400">latest · not scanned</span>
							)}
							{repo.totalSize > 0 && <Badge variant="default">{formatBytes(repo.totalSize)}</Badge>}
							<span className="text-zinc-300 text-sm">→</span>
						</div>
					</div>
				</Card>
			</Link>
			{canViewVulns && repo.latestTag && (
				<ScanVulnDialog
					open={vulnOpen}
					onClose={() => setVulnOpen(false)}
					repository={repo.name}
					tag={repo.latestTag}
				/>
			)}
		</>
	);
}

export function RepositoryList({ repos }: Props) {
	const list = useSortedFilteredList(repos, repoSearchText, "name", COMPARATORS);

	if (repos.length === 0) {
		return (
			<Card>
				<div className="py-16 text-center">
					<Package size={32} className="text-zinc-300 mx-auto mb-3" />
					<p className="text-zinc-500 text-sm">No images yet</p>
					<p className="text-zinc-400 text-xs mt-1">Push an image to get started</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-3">
			<ListToolbar
				search={list.search}
				onSearchChange={list.setSearch}
				searchPlaceholder="Filter images…"
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
					<div className="py-10 text-center text-sm text-zinc-400">No images match your search</div>
				</Card>
			) : (
				<div className="grid gap-3">
					{list.items.map((repo) => (
						<RepoRow key={repo.name} repo={repo} />
					))}
				</div>
			)}
		</div>
	);
}
