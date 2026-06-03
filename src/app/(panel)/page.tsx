import Link from "next/link";
import { Package, Users, ArrowUp, ArrowDown, Box, Trash2, ShieldCheck, HardDrive } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { db } from "@/lib/db";
import { listRepositories, healthCheck } from "@/lib/registry";
import { getFeatures } from "@/lib/features";
import { formatRelative, formatBytes } from "@/lib/utils";
import { ActivityTypeChart } from "@/components/dashboard/activity-type-chart";
import { ScanSeverityChart } from "@/components/dashboard/scan-severity-chart";
import { TopReposChart } from "@/components/dashboard/top-repos-chart";
import { ScanStatusBadge } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function mavenArtifactCount(root: string): number {
	if (!existsSync(root)) return 0;
	let count = 0;
	function walk(dir: string, depth: number) {
		if (depth > 6) return;
		try {
			const entries = readdirSync(dir);
			const hasArtifacts = entries.some((e) => e.endsWith(".jar") || e.endsWith(".pom"));
			if (hasArtifacts) {
				count++;
				return;
			}
			entries.forEach((e) => {
				try {
					if (statSync(path.join(dir, e)).isDirectory()) walk(path.join(dir, e), depth + 1);
				} catch {
					/* skip */
				}
			});
		} catch {
			/* skip */
		}
	}
	walk(root, 0);
	return count;
}

const actionBadge = (action: string) => {
	if (action === "push") return <Badge variant="success">push</Badge>;
	if (action === "pull") return <Badge variant="info">pull</Badge>;
	if (action === "delete") return <Badge variant="danger">delete</Badge>;
	return <Badge>{action}</Badge>;
};

export default async function DashboardPage() {
	const features = getFeatures();
	const users = db.users.findAll();
	const recentEvents = db.events.findRecent(10);
	const chartByAction = features.docker ? db.events.last30DaysByAction() : [];
	const topRepos = features.docker ? db.events.topRepositories(8) : [];

	const repos = features.docker ? await listRepositories() : [];
	const healthy = features.docker ? await healthCheck() : null;
	const eventStats = features.docker ? db.events.stats() : null;
	const mavenCount = features.maven ? mavenArtifactCount(process.env.MAVEN_ROOT || "/data/maven") : 0;
	const recentScans = features.docker ? db.scans.recent(8) : [];
	const scanSummary = features.docker ? db.scans.vulnSummary() : null;

	const vulnTotals = recentScans.reduce(
		(acc, s) => {
			if (s.status !== "ok") return acc;
			acc.critical += s.critical;
			acc.high += s.high;
			acc.medium += s.medium;
			acc.low += s.low;
			return acc;
		},
		{ critical: 0, high: 0, medium: 0, low: 0 },
	);
	const storageTotals = features.docker ? db.storage.totalByType() : [];
	const storageRepos = features.docker ? db.storage.latest().slice(0, 6) : [];

	const dockerStorage = storageTotals.find((s) => s.registry_type === "docker")?.total ?? 0;

	const statCards = [
		features.docker && {
			label: "Docker Images",
			value: repos.length,
			icon: Package,
			color: "text-blue-600",
			bg: "bg-blue-50",
		},
		features.maven && {
			label: "Maven Artifacts",
			value: mavenCount,
			icon: Box,
			color: "text-orange-600",
			bg: "bg-orange-50",
		},
		{ label: "Users", value: users.length, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
		features.docker &&
			eventStats && {
				label: "Total Pushes",
				value: eventStats.pushes,
				icon: ArrowUp,
				color: "text-green-600",
				bg: "bg-green-50",
			},
		features.docker &&
			eventStats && {
				label: "Total Pulls",
				value: eventStats.pulls,
				icon: ArrowDown,
				color: "text-amber-600",
				bg: "bg-amber-50",
			},
		features.docker &&
			eventStats && {
				label: "Deletes",
				value: eventStats.deletes,
				icon: Trash2,
				color: "text-red-600",
				bg: "bg-red-50",
			},
		features.docker &&
			scanSummary && {
				label: "Scanned Images",
				value: scanSummary.total,
				icon: ShieldCheck,
				color: "text-emerald-600",
				bg: "bg-emerald-50",
			},
		features.docker && {
			label: "Registry Storage",
			value: dockerStorage,
			icon: HardDrive,
			color: "text-slate-600",
			bg: "bg-slate-50",
			format: "bytes" as const,
		},
	].filter(Boolean) as {
		label: string;
		value: number;
		icon: React.ElementType;
		color: string;
		bg: string;
		format?: "bytes";
	}[];

	const subtitle = features.docker
		? healthy
			? "Registry is healthy and operational"
			: "Registry is unreachable — check your configuration"
		: "Maven repository active";

	return (
		<div>
			<Header
				title="Dashboard"
				subtitle={subtitle}
				actions={
					features.docker && healthy !== null ? (
						<Badge variant={healthy ? "success" : "danger"}>
							<span
								className={`w-1.5 h-1.5 rounded-full mr-1.5 ${healthy ? "bg-green-500" : "bg-red-500"}`}
							/>
							{healthy ? "Online" : "Offline"}
						</Badge>
					) : undefined
				}
			/>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				{statCards.map(({ label, value, icon: Icon, color, bg, format }) => (
					<Card key={label}>
						<CardContent className="flex items-center gap-4">
							<div
								className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}
							>
								<Icon size={18} className={color} />
							</div>
							<div>
								<p className="text-xl font-semibold text-zinc-900 tabular-nums">
									{format === "bytes" ? formatBytes(value) : value}
								</p>
								<p className="text-xs text-zinc-500 mt-0.5 whitespace-nowrap">{label}</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{features.docker && (
				<>
					<Card className="mb-6">
						<CardHeader>
							<CardTitle>Activity — last 30 days</CardTitle>
						</CardHeader>
						<CardContent>
							<ActivityTypeChart data={chartByAction} />
						</CardContent>
					</Card>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
						<Card>
							<CardHeader className="flex-col items-stretch gap-1.5 !items-start">
								<div className="flex items-center justify-between gap-2 w-full">
									<CardTitle>Security</CardTitle>
									<Link
										href="/security"
										className="text-xs font-medium text-blue-600 hover:underline shrink-0"
									>
										View all
									</Link>
								</div>
								{scanSummary && scanSummary.total > 0 && (
									<p className="text-xs text-zinc-500 w-full">
										{scanSummary.with_issues} of {scanSummary.total} scanned image
										{scanSummary.total !== 1 ? "s" : ""} with critical or high issues
									</p>
								)}
							</CardHeader>
							<CardContent className="space-y-4">
								<ScanSeverityChart {...vulnTotals} />
								<div className="border-t border-zinc-100 pt-3 space-y-0 divide-y divide-zinc-50 max-h-48 overflow-y-auto">
									{recentScans.length === 0 && (
										<p className="text-sm text-center text-zinc-400 py-4">No scans yet</p>
									)}
									{recentScans.map((s) => (
										<Link
											key={s.id}
											href={`/repositories/${encodeURIComponent(s.repository)}`}
											className="flex items-center justify-between gap-2 py-2.5 first:pt-0 hover:bg-zinc-50 -mx-1 px-1 rounded transition-colors"
										>
											<div className="min-w-0">
												<p className="text-xs font-mono font-medium text-zinc-900 truncate">
													{s.repository}:{s.tag}
												</p>
												<p className="text-[10px] text-zinc-400">
													{formatRelative(s.scanned_at)}
												</p>
											</div>
											<ScanStatusBadge
												scan={{
													status: s.status,
													critical: s.critical,
													high: s.high,
													medium: s.medium,
													low: s.low,
													scanned_at: s.scanned_at,
												}}
											/>
										</Link>
									))}
								</div>
							</CardContent>
						</Card>

						<Card className="lg:col-span-2">
							<CardHeader>
								<CardTitle>Recent events</CardTitle>
							</CardHeader>
							<div className="divide-y divide-zinc-50 max-h-64 overflow-y-auto">
								{recentEvents.length === 0 && (
									<p className="px-5 py-8 text-sm text-center text-zinc-400">No events yet</p>
								)}
								{recentEvents.map((e) => (
									<div key={e.id} className="px-5 py-3 flex items-start justify-between gap-2">
										<div className="min-w-0">
											<Link
												href={`/repositories/${encodeURIComponent(e.repository)}`}
												className="text-sm font-medium text-zinc-800 truncate hover:text-blue-600"
											>
												{e.repository}
											</Link>
											<p className="text-xs text-zinc-400 mt-0.5">
												{e.tag ? `tag: ${e.tag}` : e.digest?.slice(7, 19)} ·{" "}
												{formatRelative(e.timestamp)}
											</p>
										</div>
										{actionBadge(e.action)}
									</div>
								))}
							</div>
						</Card>
					</div>
				</>
			)}

			{!features.docker && (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
					<Card className="lg:col-span-3">
						<CardHeader>
							<CardTitle>Recent events</CardTitle>
						</CardHeader>
						<div className="divide-y divide-zinc-50 max-h-64 overflow-y-auto">
							{recentEvents.length === 0 && (
								<p className="px-5 py-8 text-sm text-center text-zinc-400">No events yet</p>
							)}
							{recentEvents.map((e) => (
								<div key={e.id} className="px-5 py-3 flex items-start justify-between gap-2">
									<div className="min-w-0">
										<Link
											href={`/repositories/${encodeURIComponent(e.repository)}`}
											className="text-sm font-medium text-zinc-800 truncate hover:text-blue-600"
										>
											{e.repository}
										</Link>
										<p className="text-xs text-zinc-400 mt-0.5">
											{e.tag ? `tag: ${e.tag}` : e.digest?.slice(7, 19)} ·{" "}
											{formatRelative(e.timestamp)}
										</p>
									</div>
									{actionBadge(e.action)}
								</div>
							))}
						</div>
					</Card>
				</div>
			)}

			{features.docker && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Most active images</CardTitle>
						</CardHeader>
						<CardContent>
							<TopReposChart data={topRepos} />
						</CardContent>
					</Card>

					{storageRepos.length > 0 && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle>Largest images (last snapshot)</CardTitle>
								<Link href="/storage" className="text-xs text-blue-600 hover:underline">
									Storage details
								</Link>
							</CardHeader>
							<div className="divide-y divide-zinc-50">
								{storageRepos.map((s) => (
									<Link
										key={s.repository}
										href={`/repositories/${encodeURIComponent(s.repository)}`}
										className="px-5 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
									>
										<span className="text-sm font-medium text-zinc-900">{s.repository}</span>
										<span className="text-sm text-zinc-500 tabular-nums">
											{formatBytes(s.size_bytes)}
										</span>
									</Link>
								))}
							</div>
						</Card>
					)}
				</div>
			)}
		</div>
	);
}
