"use client";

import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { SortDirection, SortOption } from "@/hooks/use-sorted-filtered-list";

interface Props {
	search: string;
	onSearchChange: (value: string) => void;
	searchPlaceholder?: string;
	sortId: string;
	onSortChange: (id: string) => void;
	sortOptions: SortOption[];
	direction: SortDirection;
	onToggleDirection: () => void;
	visibleCount: number;
	totalCount: number;
	className?: string;
}

export function ListToolbar({
	search,
	onSearchChange,
	searchPlaceholder = "Search…",
	sortId,
	onSortChange,
	sortOptions,
	direction,
	onToggleDirection,
	visibleCount,
	totalCount,
	className,
}: Props) {
	const filtered = search.trim().length > 0;
	const showCount = filtered || visibleCount !== totalCount;

	return (
		<div className={className}>
			<div className="flex flex-col sm:flex-row gap-2 sm:items-end">
				<div className="relative flex-1 min-w-0">
					<Search
						size={14}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
					/>
					<Input
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder={searchPlaceholder}
						className="pl-9"
						aria-label="Search list"
					/>
				</div>
				<div className="flex gap-2 sm:w-auto w-full">
					<Select
						value={sortId}
						onChange={(e) => onSortChange(e.target.value)}
						className="sm:w-44 flex-1"
						aria-label="Sort by"
					>
						{sortOptions.map((opt) => (
							<option key={opt.id} value={opt.id}>
								{opt.label}
							</option>
						))}
					</Select>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="h-8 px-2.5 shrink-0"
						onClick={onToggleDirection}
						title={direction === "asc" ? "Ascending" : "Descending"}
						aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
					>
						{direction === "asc" ? <ArrowDownAZ size={16} /> : <ArrowUpAZ size={16} />}
					</Button>
				</div>
			</div>
			{showCount && (
				<p className="text-xs text-zinc-400 mt-2">
					Showing {visibleCount} of {totalCount}
				</p>
			)}
		</div>
	);
}
