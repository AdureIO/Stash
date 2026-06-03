"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Row {
	day: string;
	action: string;
	count: number;
}

interface Props {
	data: Row[];
}

const ACTION_COLORS: Record<string, string> = {
	pull: "#3b82f6",
	push: "#22c55e",
	delete: "#ef4444",
};

const ACTION_ORDER = ["pull", "push", "delete"];

export function ActivityTypeChart({ data }: Props) {
	if (data.length === 0) {
		return (
			<div className="h-40 flex items-center justify-center text-sm text-zinc-400">
				No activity in the last 30 days
			</div>
		);
	}

	const byDay = new Map<string, Record<string, number | string>>();
	for (const row of data) {
		const day = new Date(row.day).toLocaleDateString("en", { month: "short", day: "numeric" });
		if (!byDay.has(day)) byDay.set(day, { day });
		const entry = byDay.get(day)!;
		entry[row.action] = (Number(entry[row.action]) || 0) + row.count;
	}
	const chartData = Array.from(byDay.values());
	const actions = ACTION_ORDER.filter((action) => data.some((d) => d.action === action));

	return (
		<div className="w-full">
			<ResponsiveContainer width="100%" height={160}>
				<BarChart data={chartData} barCategoryGap="20%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
					<XAxis dataKey="day" tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} />
					<YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={28} />
					<Tooltip
						contentStyle={{
							fontSize: 12,
							borderRadius: 6,
							border: "1px solid #e4e4e7",
							boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
							color: "#3f3f46",
						}}
						cursor={{ fill: "#fafafa" }}
					/>
					<Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
					{actions.map((action, index) => (
						<Bar
							key={action}
							dataKey={action}
							stackId="a"
							fill={ACTION_COLORS[action] || "#a1a1aa"}
							maxBarSize={48}
							radius={index === actions.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
						/>
					))}
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
