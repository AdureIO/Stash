"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props {
	critical: number;
	high: number;
	medium: number;
	low: number;
}

const SEVERITY = [
	{ key: "critical", label: "Critical", fill: "#dc2626" },
	{ key: "high", label: "High", fill: "#f97316" },
	{ key: "medium", label: "Medium", fill: "#fbbf24" },
	{ key: "low", label: "Low", fill: "#0ea5e9" },
] as const;

export function ScanSeverityChart({ critical, high, medium, low }: Props) {
	const values: Record<string, number> = { critical, high, medium, low };
	const chartData = SEVERITY.map(({ key, label, fill }) => ({
		severity: label,
		count: values[key] ?? 0,
		fill,
	})).filter((d) => d.count > 0);

	const total = critical + high + medium + low;
	if (total === 0) {
		return (
			<div className="h-40 flex items-center justify-center text-sm text-zinc-400">
				No vulnerabilities in recent scans
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={180}>
			<BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
				<CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
				<XAxis dataKey="severity" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
				<YAxis
					tick={{ fontSize: 11, fill: "#71717a" }}
					axisLine={false}
					tickLine={false}
					allowDecimals={false}
				/>
				<Tooltip
					contentStyle={{
						fontSize: 12,
						borderRadius: 6,
						border: "1px solid #e4e4e7",
						color: "#3f3f46",
					}}
					formatter={(value: number) => [value, "Findings"]}
				/>
				<Bar dataKey="count" radius={[4, 4, 0, 0]}>
					{chartData.map((entry) => (
						<Cell key={entry.severity} fill={entry.fill} />
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
