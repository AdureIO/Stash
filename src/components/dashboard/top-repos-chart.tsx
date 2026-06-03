"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props {
	data: { repository: string; events: number }[];
}

export function TopReposChart({ data }: Props) {
	if (data.length === 0) {
		return <div className="h-40 flex items-center justify-center text-sm text-zinc-400">No image activity yet</div>;
	}

	const formatted = data.map((d) => ({
		name: d.repository.length > 28 ? `…${d.repository.slice(-26)}` : d.repository,
		full: d.repository,
		events: d.events,
	}));

	return (
		<ResponsiveContainer width="100%" height={Math.max(160, formatted.length * 28)}>
			<BarChart data={formatted} layout="vertical" barSize={14} margin={{ left: 8, right: 8 }}>
				<CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
				<XAxis type="number" tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} />
				<YAxis
					type="category"
					dataKey="name"
					width={120}
					tick={{ fontSize: 10, fill: "#71717a" }}
					tickLine={false}
					axisLine={false}
				/>
				<Tooltip
					formatter={(value) => [value, "Events"]}
					labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
					contentStyle={{
						fontSize: 12,
						borderRadius: 6,
						border: "1px solid #e4e4e7",
						color: "#3f3f46",
					}}
				/>
				<Bar dataKey="events" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
			</BarChart>
		</ResponsiveContainer>
	);
}
