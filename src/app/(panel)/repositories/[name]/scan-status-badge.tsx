import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScanInfo {
	status: string;
	critical: number;
	high: number;
	medium: number;
	low: number;
	scanned_at: string;
}

const SEVERITY = [
	{ key: "critical" as const, bg: "bg-red-600", label: "Critical" },
	{ key: "high" as const, bg: "bg-orange-500", label: "High" },
	{ key: "medium" as const, bg: "bg-amber-400 text-amber-950", label: "Medium" },
	{ key: "low" as const, bg: "bg-sky-500", label: "Low" },
];

function CountPill({ count, bg, label }: { count: number; bg: string; label: string }) {
	if (count <= 0) return null;
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-sm text-[10px] font-bold tabular-nums leading-none text-white",
				bg,
			)}
			title={`${count} ${label}`}
		>
			{count}
		</span>
	);
}

export function ScanStatusBadge({ scan }: { scan: ScanInfo | null | undefined }) {
	if (!scan) {
		return <span className="text-xs text-zinc-400">—</span>;
	}

	if (scan.status !== "ok") {
		return (
			<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-red-50 text-red-600 text-[11px] font-medium leading-none">
				<AlertCircle size={11} className="shrink-0" />
				Failed
			</span>
		);
	}

	const total = scan.critical + scan.high + scan.medium + scan.low;
	if (total === 0) {
		return (
			<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 text-[11px] font-medium leading-none">
				<Check size={11} className="shrink-0" strokeWidth={2.5} />
				Clean
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-0.5">
			{SEVERITY.map(({ key, bg, label }) => (
				<CountPill key={key} count={scan[key]} bg={bg} label={label} />
			))}
		</span>
	);
}
