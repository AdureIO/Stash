"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

export interface VulnRow {
	VulnerabilityID: string;
	PkgName: string;
	Severity: string;
	FixedVersion?: string;
	Title?: string;
}

interface ScanDetail {
	repository: string;
	tag: string;
	status: string;
	critical: number;
	high: number;
	medium: number;
	low: number;
	scanned_at?: string;
	error?: string;
	vulns?: VulnRow[];
}

interface Props {
	open: boolean;
	onClose: () => void;
	repository: string;
	tag: string;
	scanApiPath?: string;
}

function sevBadge(n: number, sev: string) {
	if (n === 0) return null;
	const variant = sev === "critical" ? "danger" : sev === "high" ? "warning" : "default";
	return (
		<Badge key={sev} variant={variant}>
			{n} {sev}
		</Badge>
	);
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

export function ScanVulnDialog({ open, onClose, repository, tag, scanApiPath }: Props) {
	const [detail, setDetail] = useState<ScanDetail | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) {
			setDetail(null);
			return;
		}
		const path = scanApiPath ?? `/api/admin/scan/${encodeURIComponent(repository)}/${encodeURIComponent(tag)}`;
		let cancelled = false;
		setLoading(true);
		apiFetch<ScanDetail>(path)
			.then(({ ok, data }) => {
				if (!cancelled) {
					if (ok && data) setDetail(data);
					else
						setDetail({
							repository,
							tag,
							status: "error",
							critical: 0,
							high: 0,
							medium: 0,
							low: 0,
							error: "Could not load scan results",
						});
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, repository, tag, scanApiPath]);

	const sortedVulns = [...(detail?.vulns ?? [])].sort(
		(a, b) => (SEV_ORDER[a.Severity] ?? 9) - (SEV_ORDER[b.Severity] ?? 9),
	);

	return (
		<Dialog open={open} onClose={onClose} title={`${repository}:${tag}`} className="max-w-3xl">
			{loading && <p className="text-sm text-zinc-500 py-6 text-center">Loading vulnerabilities…</p>}
			{!loading && detail && (
				<div className="space-y-3 max-h-[28rem] overflow-y-auto">
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
								{detail.critical + detail.high + detail.medium + detail.low === 0 && (
									<Badge variant="success">Clean</Badge>
								)}
							</div>
							{sortedVulns.length > 0 ? (
								<table className="w-full text-xs">
									<thead className="sticky top-0 bg-white">
										<tr className="border-b border-zinc-200">
											<th className="text-left py-2 pr-2 font-semibold text-zinc-500">CVE</th>
											<th className="text-left py-2 pr-2 font-semibold text-zinc-500">Package</th>
											<th className="text-left py-2 pr-2 font-semibold text-zinc-500">
												Severity
											</th>
											<th className="text-left py-2 font-semibold text-zinc-500">Fixed in</th>
										</tr>
									</thead>
									<tbody>
										{sortedVulns.map((v) => (
											<tr
												key={`${v.VulnerabilityID}-${v.PkgName}`}
												className="border-b border-zinc-50"
											>
												<td className="py-1.5 pr-2 font-mono text-blue-600 align-top">
													{v.VulnerabilityID}
												</td>
												<td className="py-1.5 pr-2 align-top">{v.PkgName}</td>
												<td className="py-1.5 pr-2 align-top">
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
												<td className="py-1.5 text-zinc-500 align-top">
													{v.FixedVersion || "—"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							) : (
								<p className="text-sm text-zinc-500 py-4 text-center">No vulnerabilities found.</p>
							)}
						</>
					)}
				</div>
			)}
		</Dialog>
	);
}
