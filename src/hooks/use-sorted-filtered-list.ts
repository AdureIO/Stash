"use client";

import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortOption {
	id: string;
	label: string;
}

function compareStrings(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNumbers(a: number, b: number): number {
	return a - b;
}

function compareDates(a: string | null, b: string | null): number {
	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a.localeCompare(b);
}

export { compareStrings, compareNumbers, compareDates };

export function useSortedFilteredList<T>(
	items: T[],
	getSearchText: (item: T) => string,
	defaultSortId: string,
	comparators: Record<string, (a: T, b: T) => number>,
	defaultDirection: SortDirection = "asc",
) {
	const [search, setSearch] = useState("");
	const [sortId, setSortId] = useState(defaultSortId);
	const [direction, setDirection] = useState<SortDirection>(defaultDirection);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return items;
		return items.filter((item) => getSearchText(item).toLowerCase().includes(q));
	}, [items, search, getSearchText]);

	const sorted = useMemo(() => {
		const cmp = comparators[sortId];
		if (!cmp) return filtered;
		const mult = direction === "asc" ? 1 : -1;
		return [...filtered].sort((a, b) => mult * cmp(a, b));
	}, [filtered, sortId, direction, comparators]);

	const toggleDirection = () => setDirection((d) => (d === "asc" ? "desc" : "asc"));

	return {
		search,
		setSearch,
		sortId,
		setSortId,
		direction,
		setDirection,
		toggleDirection,
		items: sorted,
		totalCount: items.length,
		visibleCount: sorted.length,
	};
}
