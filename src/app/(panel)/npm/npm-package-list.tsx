"use client";

import { Box } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list/list-toolbar";
import {
	compareNumbers,
	compareStrings,
	useSortedFilteredList,
} from "@/hooks/use-sorted-filtered-list";
import { formatBytes } from "@/lib/utils";
import { VisibilityToggle, PublicBadge } from "@/components/visibility/visibility-toggle";

export interface NpmPackageSummary {
	name: string;
	versions: string[];
	size: number;
}

const SORT_OPTIONS = [
	{ id: "name", label: "Name" },
	{ id: "versions", label: "Versions" },
	{ id: "size", label: "Size" },
] as const;

const COMPARATORS = {
	name: (a: NpmPackageSummary, b: NpmPackageSummary) => compareStrings(a.name, b.name),
	versions: (a: NpmPackageSummary, b: NpmPackageSummary) =>
		compareNumbers(a.versions.length, b.versions.length),
	size: (a: NpmPackageSummary, b: NpmPackageSummary) => compareNumbers(a.size, b.size),
};

function npmSearchText(p: NpmPackageSummary) {
	return `${p.name} ${p.versions.join(" ")}`;
}

interface Props {
	packages: NpmPackageSummary[];
	manageByName?: Record<string, boolean>;
	publicByName?: Record<string, boolean>;
}

export function NpmPackageList({ packages, manageByName = {}, publicByName = {} }: Props) {
	const list = useSortedFilteredList(packages, npmSearchText, "name", COMPARATORS);

	if (packages.length === 0) {
		return (
			<Card>
				<div className="py-12 text-center">
					<Box size={32} className="text-zinc-300 mx-auto mb-3" />
					<p className="text-sm text-zinc-500">No packages yet</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-3">
			<ListToolbar
				search={list.search}
				onSearchChange={list.setSearch}
				searchPlaceholder="Filter packages…"
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
					<div className="py-10 text-center text-sm text-zinc-400">No packages match your search</div>
				</Card>
			) : (
				list.items.map((p) => (
					<Card key={p.name}>
						<CardContent className="flex items-center justify-between gap-4">
							<div>
								<div className="flex items-center gap-2 flex-wrap">
									<p className="font-mono font-semibold text-zinc-900 text-sm">{p.name}</p>
									{publicByName[p.name] && !manageByName[p.name] ? <PublicBadge /> : null}
								</div>
								<div className="flex gap-1 mt-1.5 flex-wrap">
									{p.versions.map((v) => (
										<Badge key={v} variant="default">
											{v}
										</Badge>
									))}
								</div>
							</div>
							<div className="flex items-center gap-4">
								{(manageByName[p.name] || publicByName[p.name]) && (
									<VisibilityToggle
										registryType="npm"
										resourceKey={p.name}
										initialPublic={!!publicByName[p.name]}
										canManage={!!manageByName[p.name]}
										compact
									/>
								)}
								<div className="text-right">
									<p className="text-sm font-medium text-zinc-700">{formatBytes(p.size)}</p>
									<p className="text-xs text-zinc-400">
										{p.versions.length} version{p.versions.length !== 1 ? "s" : ""}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				))
			)}
		</div>
	);
}
