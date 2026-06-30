"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, HardDrive, Info } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatBytes } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { StorageSnapshot } from "@/lib/db";
import type { DiskBreakdown } from "@/lib/disk-usage";

interface StorageData {
	snapshots: StorageSnapshot[];
	totals: { registry_type: string; total: number }[];
	breakdown?: DiskBreakdown;
	cached: boolean;
}

const TYPE_COLORS: Record<string, string> = { docker: "#3b82f6", maven: "#f97316", npm: "#a855f7" };

const BREAKDOWN_ROWS: { key: keyof DiskBreakdown; label: string; hint?: string }[] = [
	{
		key: "docker_registry",
		label: "Docker registry (on disk)",
		hint: "Full blob store under /data/registry — includes layers from deleted tags until garbage collection runs.",
	},
	{
		key: "docker_logical",
		label: "Docker images (referenced)",
		hint: "Sum of layer sizes currently referenced by image tags.",
	},
	{ key: "trivy", label: "Trivy (scanner + DBs)", hint: "Vulnerability databases and scan cache under /data/trivy." },
	{ key: "maven", label: "Maven artifacts" },
	{ key: "npm", label: "NPM packages" },
	{ key: "database", label: "Database" },
	{ key: "other", label: "Other" },
];

export default function StoragePage() {
	const [data, setData] = useState<StorageData | null>(null);
	const [loading, setLoading] = useState(true);

	async function load(refresh = false) {
		setLoading(true);
		const { ok, data: d } = await apiFetch<StorageData>(`/api/admin/storage${refresh ? "?refresh=1" : ""}`);
		if (ok && d) setData(d);
		setLoading(false);
	}

	useEffect(() => {
		load();
	}, []);

	const chartData =
		data?.snapshots
			.filter((s) => s.registry_type === "docker")
			.slice(0, 20)
			.map((s) => ({
				name: s.repository.length > 20 ? "…" + s.repository.slice(-18) : s.repository,
				size: Math.round(s.size_bytes / 1024 / 1024),
				type: s.registry_type,
				fill: TYPE_COLORS[s.registry_type] || "#a1a1aa",
			})) ?? [];

	const dockerGap =
		data?.breakdown && data.breakdown.docker_registry > data.breakdown.docker_logical
			? data.breakdown.docker_registry - data.breakdown.docker_logical
			: 0;

	return (
		<div>
			<Header
				title="Storage Analytics"
				subtitle="On-disk volume usage and referenced image sizes"
				actions={
					<Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}>
						<RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
					</Button>
				}
			/>

			{/* Total volume */}
			{data?.breakdown && (
				<Card className="mb-4">
					<CardContent className="flex items-center gap-3 py-5">
						<div className="w-3 h-12 rounded-sm bg-zinc-900" />
						<div>
							<p className="text-2xl font-semibold text-zinc-900">{formatBytes(data.breakdown.total)}</p>
							<p className="text-xs text-zinc-500">Total /data volume</p>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Referenced totals by registry type */}
			<div className="grid grid-cols-3 gap-4 mb-6">
				{(data?.totals ?? []).map((t) => (
					<Card key={t.registry_type}>
						<CardContent className="flex items-center gap-3">
							<div
								className="w-3 h-10 rounded-sm"
								style={{ background: TYPE_COLORS[t.registry_type] || "#a1a1aa" }}
							/>
							<div>
								<p className="text-xl font-semibold text-zinc-900">{formatBytes(t.total)}</p>
								<p className="text-xs text-zinc-500 capitalize">{t.registry_type} referenced</p>
							</div>
						</CardContent>
					</Card>
				))}
				{!data && (
					<Card>
						<CardContent>
							<div className="h-10 bg-zinc-100 rounded animate-pulse" />
						</CardContent>
					</Card>
				)}
			</div>

			{/* On-disk breakdown */}
			{data?.breakdown && (
				<Card className="mb-4">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<HardDrive size={14} /> On-disk breakdown
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="divide-y divide-zinc-50">
							{BREAKDOWN_ROWS.map(({ key, label, hint }) => {
								const value = data.breakdown![key];
								if (key === "other" && value === 0) return null;
								if (key === "npm" && value === 0) return null;
								return (
									<div key={key} className="py-3 flex items-center justify-between gap-4">
										<div>
											<p className="text-sm font-medium text-zinc-900">{label}</p>
											{hint && <p className="text-xs text-zinc-400 mt-0.5">{hint}</p>}
										</div>
										<span className="text-sm text-zinc-600 font-medium shrink-0">
											{formatBytes(value)}
										</span>
									</div>
								);
							})}
						</div>
						{dockerGap > 0 && (
							<div className="mt-4 flex gap-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-900">
								<Info size={14} className="shrink-0 mt-0.5" />
								<p>
									About {formatBytes(dockerGap)} of Docker registry disk space is not referenced by
									current image tags (deleted tags, untagged layers, or duplicate blobs). Run{" "}
									<Link href="/settings" className="underline font-medium">
										garbage collection
									</Link>{" "}
									in Settings to reclaim it.
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Bar chart */}
			<Card className="mb-4">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<HardDrive size={14} /> Top Docker images by referenced size
					</CardTitle>
				</CardHeader>
				<CardContent>
					{chartData.length === 0 && loading && <div className="h-48 bg-zinc-50 rounded animate-pulse" />}
					{chartData.length === 0 && !loading && (
						<p className="text-sm text-zinc-400 text-center py-8">
							No storage data — click Refresh to scan
						</p>
					)}
					{chartData.length > 0 && (
						<ResponsiveContainer width="100%" height={220}>
							<BarChart data={chartData} barSize={16} layout="vertical">
								<CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
								<XAxis
									type="number"
									tick={{ fontSize: 11, fill: "#a1a1aa" }}
									tickLine={false}
									axisLine={false}
									tickFormatter={(v) => `${v}MB`}
								/>
								<YAxis
									type="category"
									dataKey="name"
									tick={{ fontSize: 11, fill: "#71717a" }}
									tickLine={false}
									axisLine={false}
									width={140}
								/>
								<Tooltip
									formatter={(v: number) => [`${v} MB`, "Size"]}
									contentStyle={{
										fontSize: 12,
										borderRadius: 6,
										border: "1px solid #e4e4e7",
										color: "#3f3f46",
									}}
								/>
								<Bar dataKey="size" radius={[0, 3, 3, 0]} fill="#3b82f6" />
							</BarChart>
						</ResponsiveContainer>
					)}
				</CardContent>
			</Card>

			{/* Table */}
			{data && data.snapshots.length > 0 && (
				<Card>
					<div className="divide-y divide-zinc-50">
						{data.snapshots.map((s) => (
							<div
								key={`${s.repository}-${s.registry_type}`}
								className="px-5 py-3 flex items-center justify-between"
							>
								<div>
									<span className="text-sm font-medium text-zinc-900">{s.repository}</span>
									<Badge variant="default" className="ml-2 text-xs capitalize">
										{s.registry_type}
									</Badge>
								</div>
								<span className="text-sm text-zinc-600 font-medium">{formatBytes(s.size_bytes)}</span>
							</div>
						))}
					</div>
				</Card>
			)}
		</div>
	);
}
