"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Package, Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { formatRelative } from "@/lib/utils";

interface SearchResult {
	repositories: { name: string; tagCount: number }[];
	events: {
		id: number;
		action: string;
		repository: string;
		tag: string | null;
		actor: string | null;
		timestamp: string;
	}[];
}

function actionBadge(action: string) {
	if (action === "push") return <Badge variant="success">push</Badge>;
	if (action === "pull") return <Badge variant="info">pull</Badge>;
	if (action === "delete") return <Badge variant="danger">delete</Badge>;
	return <Badge>{action}</Badge>;
}

export function GlobalSearch() {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<SearchResult | null>(null);
	const [loading, setLoading] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (query.length < 2) {
			setResults(null);
			setLoading(false);
			return;
		}
		setLoading(true);
		const timer = setTimeout(async () => {
			const { ok, data } = await apiFetch<SearchResult>(`/api/search?q=${encodeURIComponent(query)}`);
			if (ok && data) setResults(data);
			setLoading(false);
		}, 250);
		return () => clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		function onPointerDown(e: PointerEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setOpen(false);
				inputRef.current?.blur();
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	const showResults = open && query.length >= 2;
	const total = results ? results.repositories.length + results.events.length : 0;

	return (
		<div ref={rootRef} className="relative px-3 py-3 border-b border-zinc-800/60 shrink-0">
			<div className="relative">
				<Search
					size={14}
					className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
				/>
				<input
					ref={inputRef}
					type="search"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder="Search…"
					aria-label="Search images and activity"
					aria-expanded={showResults}
					className="w-full pl-8 pr-8 py-2 text-[13px] rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
				/>
				{loading && (
					<Loader2
						size={14}
						className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin"
					/>
				)}
			</div>

			{showResults && (
				<div
					role="listbox"
					className="absolute left-3 right-3 top-full mt-1 z-50 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl"
				>
					{!loading && results && total > 0 && (
						<p className="px-3 py-2 text-[10px] font-medium text-zinc-400 border-b border-zinc-100">
							{total} result{total !== 1 ? "s" : ""}
						</p>
					)}

					{results && results.repositories.length > 0 && (
						<div>
							<div className="px-3 py-1.5 flex items-center gap-1.5 bg-zinc-50 border-b border-zinc-100">
								<Package size={11} className="text-zinc-400" />
								<span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
									Images
								</span>
							</div>
							{results.repositories.map((r) => (
								<Link
									key={r.name}
									href={`/repositories/${encodeURIComponent(r.name)}`}
									onClick={() => {
										setOpen(false);
										setQuery("");
									}}
									className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors"
								>
									<span className="font-medium text-zinc-900 truncate">{r.name}</span>
									<Badge variant="default">{r.tagCount} tags</Badge>
								</Link>
							))}
						</div>
					)}

					{results && results.events.length > 0 && (
						<div>
							<div className="px-3 py-1.5 flex items-center gap-1.5 bg-zinc-50 border-b border-zinc-100">
								<Activity size={11} className="text-zinc-400" />
								<span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
									Activity
								</span>
							</div>
							{results.events.map((e) => (
								<Link
									key={e.id}
									href="/activity"
									onClick={() => {
										setOpen(false);
										setQuery("");
									}}
									className="block px-3 py-2 hover:bg-zinc-50 transition-colors"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="text-sm font-medium text-zinc-900 truncate">
											{e.repository}
											{e.tag && <span className="text-zinc-400 font-normal">:{e.tag}</span>}
										</span>
										{actionBadge(e.action)}
									</div>
									<p className="text-[11px] text-zinc-400 mt-0.5 truncate">
										{e.actor ? `${e.actor} · ` : ""}
										{formatRelative(e.timestamp)}
									</p>
								</Link>
							))}
						</div>
					)}

					{!loading && results && total === 0 && (
						<p className="px-3 py-6 text-center text-sm text-zinc-400">No results</p>
					)}
				</div>
			)}
		</div>
	);
}
