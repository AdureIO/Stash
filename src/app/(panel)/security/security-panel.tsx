"use client";
import { useMemo, useState } from "react";
import { Shield, Play, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegistryImageRef } from "@/lib/registry";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { ScanResult } from "@/lib/db";

type SafeScan = Omit<ScanResult, "raw_json">;

interface ScanDetails {
	critical: number;
	high: number;
	medium: number;
	low: number;
	vulns?: { VulnerabilityID: string; PkgName: string; Severity: string; FixedVersion?: string; Title?: string }[];
}

interface Props {
	scans: SafeScan[];
	dockerEnabled: boolean;
	images: RegistryImageRef[];
}

function imageKey(img: RegistryImageRef) {
	return `${img.repository}:${img.tag}`;
}

export function SecurityPanel({ scans: initial, dockerEnabled, images }: Props) {
	const [scans, setScans] = useState(initial);
	const [scanning, setScanning] = useState<string | null>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const [detail, setDetail] = useState<(SafeScan & ScanDetails & { error?: string }) | null>(null);
	const [selected, setSelected] = useState<RegistryImageRef | null>(null);
	const [scanOpen, setScanOpen] = useState(false);
	const [filter, setFilter] = useState("");

	const filteredImages = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return images;
		return images.filter((img) => imageKey(img).toLowerCase().includes(q));
	}, [images, filter]);

	async function refresh() {
		const { ok, data } = await apiFetch<SafeScan[]>("/api/admin/scan");
		if (ok && data) setScans(data);
	}

	async function handleScan(repo: string, tag: string) {
		const key = `${repo}:${tag}`;
		setScanning(key);
		setScanError(null);
		const { ok, error } = await apiFetch(`/api/admin/scan/${encodeURIComponent(repo)}/${tag}`, { method: "POST" });
		setScanning(null);
		if (!ok) setScanError(error || "Scan failed");
		await refresh();
	}

	async function viewDetail(scan: SafeScan) {
		const { ok, data } = await apiFetch<ScanDetails & { raw_json?: string; error?: string }>(
			`/api/admin/scan/${encodeURIComponent(scan.repository)}/${scan.tag}`,
		);
		if (ok && data) setDetail({ ...scan, ...data });
	}

	const sevBadge = (n: number, sev: string) => {
		if (n === 0) return null;
		const variant = sev === "critical" ? "danger" : sev === "high" ? "warning" : "default";
		return (
			<Badge key={sev} variant={variant} className="mr-1">
				{n} {sev}
			</Badge>
		);
	};

	return (
		<>
			<div className="flex justify-end mb-4">
				<Button
					onClick={() => {
						setSelected(images[0] ?? null);
						setFilter("");
						setScanOpen(true);
					}}
					disabled={!dockerEnabled || images.length === 0}
				>
					<Play size={14} /> Scan image
				</Button>
			</div>

			{!dockerEnabled && (
				<Card>
					<div className="px-5 py-4 text-sm text-zinc-500 flex items-center gap-2">
						<AlertTriangle size={14} className="text-amber-500" /> Docker is disabled — Trivy scanning
						requires Docker registry.
					</div>
				</Card>
			)}

			{scanError && (
				<Card className="mb-4 border-red-200 bg-red-50">
					<div className="px-5 py-3 text-sm text-red-700 flex items-start gap-2">
						<XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
						<span>{scanError}</span>
					</div>
				</Card>
			)}

			<Card>
				<Table>
					<Thead>
						<tr>
							<Th>Image</Th>
							<Th>Vulnerabilities</Th>
							<Th>Status</Th>
							<Th>Scanned</Th>
							<Th />
						</tr>
					</Thead>
					<Tbody>
						{scans.map((s) => (
							<Tr key={s.id}>
								<Td>
									<span className="font-mono text-sm font-medium text-zinc-900">
										{s.repository}:{s.tag}
									</span>
								</Td>
								<Td>
									{s.status === "ok" ? (
										<div className="flex flex-wrap gap-1">
											{s.critical > 0 ? sevBadge(s.critical, "critical") : null}
											{s.high > 0 ? sevBadge(s.high, "high") : null}
											{s.medium > 0 ? sevBadge(s.medium, "medium") : null}
											{s.low > 0 ? sevBadge(s.low, "low") : null}
											{s.critical + s.high + s.medium + s.low === 0 && (
												<Badge variant="success">Clean</Badge>
											)}
										</div>
									) : s.status === "error" ? (
										<span className="text-xs text-red-500">Failed</span>
									) : (
										<span className="text-xs text-zinc-400">—</span>
									)}
								</Td>
								<Td>
									{s.status === "ok" ? (
										<CheckCircle size={14} className="text-green-500" />
									) : s.status === "error" ? (
										<XCircle size={14} className="text-red-400" />
									) : (
										<Shield size={14} className="text-zinc-300" />
									)}
								</Td>
								<Td className="text-xs text-zinc-400">{formatDate(s.scanned_at)}</Td>
								<Td>
									<div className="flex items-center gap-1">
										<Button variant="ghost" size="sm" onClick={() => viewDetail(s)}>
											Details
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleScan(s.repository, s.tag)}
											disabled={scanning === `${s.repository}:${s.tag}`}
										>
											<Play
												size={12}
												className={
													scanning === `${s.repository}:${s.tag}` ? "animate-pulse" : ""
												}
											/>
										</Button>
									</div>
								</Td>
							</Tr>
						))}
						{scans.length === 0 && (
							<Tr>
								<Td colSpan={5} className="py-10 text-center text-zinc-400">
									No scans yet — click &ldquo;Scan image&rdquo; to run Trivy on a registry image
								</Td>
							</Tr>
						)}
					</Tbody>
				</Table>
			</Card>

			{/* Scan new image */}
			<Dialog open={scanOpen} onClose={() => setScanOpen(false)} title="Scan image" className="max-w-lg">
				<div className="space-y-4">
					{images.length === 0 ? (
						<p className="text-sm text-zinc-500 py-4 text-center">
							No images in the registry yet. Push an image first.
						</p>
					) : (
						<>
							<input
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Filter images…"
								className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
							/>
							<ul className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
								{filteredImages.map((img) => {
									const key = imageKey(img);
									const isSelected =
										selected?.repository === img.repository && selected?.tag === img.tag;
									return (
										<li key={key}>
											<button
												type="button"
												onClick={() => setSelected(img)}
												className={cn(
													"w-full px-3 py-2.5 text-left text-sm font-mono transition-colors",
													isSelected
														? "bg-blue-50 text-blue-900"
														: "hover:bg-zinc-50 text-zinc-800",
												)}
											>
												{key}
											</button>
										</li>
									);
								})}
								{filteredImages.length === 0 && (
									<li className="px-3 py-6 text-center text-sm text-zinc-400">
										No images match your filter
									</li>
								)}
							</ul>
						</>
					)}
					<p className="text-xs text-zinc-500">
						Trivy is installed on first boot into the data volume (/data/trivy).
					</p>
					<div className="flex gap-2 justify-end">
						<Button variant="secondary" size="sm" onClick={() => setScanOpen(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={() => {
								if (!selected) return;
								handleScan(selected.repository, selected.tag);
								setScanOpen(false);
							}}
							disabled={!selected}
						>
							Scan
						</Button>
					</div>
				</div>
			</Dialog>

			{/* CVE detail */}
			<Dialog
				open={!!detail}
				onClose={() => setDetail(null)}
				title={`${detail?.repository}:${detail?.tag}`}
				className="max-w-2xl"
			>
				{detail && (
					<div className="space-y-3 max-h-96 overflow-y-auto">
						{detail.status === "error" && detail.error ? (
							<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-mono whitespace-pre-wrap break-words">
								{detail.error}
							</div>
						) : (
							<>
								<div className="flex gap-2 flex-wrap">
									{sevBadge(detail.critical, "critical")}
									{sevBadge(detail.high, "high")}
									{sevBadge(detail.medium, "medium")}
									{sevBadge(detail.low, "low")}
								</div>
								{detail.vulns && detail.vulns.length > 0 && (
									<table className="w-full text-xs">
										<thead>
											<tr className="border-b">
												<th className="text-left py-1 pr-2">CVE</th>
												<th className="text-left py-1 pr-2">Package</th>
												<th className="text-left py-1 pr-2">Severity</th>
												<th className="text-left py-1">Fix</th>
											</tr>
										</thead>
										<tbody>
											{detail.vulns.slice(0, 50).map((v) => (
												<tr key={v.VulnerabilityID} className="border-b border-zinc-50">
													<td className="py-1 pr-2 font-mono text-blue-600">
														{v.VulnerabilityID}
													</td>
													<td className="py-1 pr-2">{v.PkgName}</td>
													<td className="py-1 pr-2">
														<Badge
															variant={
																v.Severity === "CRITICAL"
																	? "danger"
																	: v.Severity === "HIGH"
																		? "warning"
																		: "default"
															}
														>
															{v.Severity}
														</Badge>
													</td>
													<td className="py-1 text-zinc-400">{v.FixedVersion || "—"}</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</>
						)}
					</div>
				)}
			</Dialog>
		</>
	);
}
