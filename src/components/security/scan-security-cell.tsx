"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { ScanStatusBadge, type ScanInfo } from "@/app/(panel)/repositories/[name]/scan-status-badge";
import { ScanVulnDialog } from "./scan-vuln-dialog";
import { formatRelative } from "@/lib/utils";

interface Props {
	repository: string;
	tag: string;
	scan: ScanInfo | null | undefined;
	isAdmin?: boolean;
	onScan?: () => void;
	scanning?: boolean;
	/** Override default `/api/admin/scan/{repo}/{tag}` (e.g. Maven). */
	scanApiPath?: string;
}

export function ScanSecurityCell({ repository, tag, scan, isAdmin, onScan, scanning, scanApiPath }: Props) {
	const [vulnOpen, setVulnOpen] = useState(false);
	const canViewVulns = scan && (scan.status === "ok" || scan.status === "error");

	return (
		<>
			<div className="flex items-center gap-2">
				{canViewVulns ? (
					<button
						type="button"
						onClick={() => setVulnOpen(true)}
						className="inline-flex items-center gap-0.5 rounded-md hover:bg-zinc-100 px-1 py-0.5 transition-colors"
						title="View vulnerabilities"
					>
						<ScanStatusBadge scan={scan} />
					</button>
				) : (
					<ScanStatusBadge scan={scan} />
				)}
				{scan?.scanned_at && (
					<span className="text-[10px] text-zinc-400 whitespace-nowrap" title={scan.scanned_at}>
						{formatRelative(scan.scanned_at)}
					</span>
				)}
				{isAdmin && onScan && (
					<button
						type="button"
						onClick={onScan}
						disabled={scanning}
						title={scanning ? "Scanning…" : scan ? "Rescan" : "Scan"}
						className="inline-flex items-center justify-center h-6 w-6 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
					>
						<Play size={12} className={scanning ? "animate-pulse" : ""} />
					</button>
				)}
			</div>
			{canViewVulns && (
				<ScanVulnDialog
					open={vulnOpen}
					onClose={() => setVulnOpen(false)}
					repository={repository}
					tag={tag}
					scanApiPath={scanApiPath}
				/>
			)}
		</>
	);
}
