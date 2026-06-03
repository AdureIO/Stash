"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface Props {
	pushes: number;
	pulls: number;
	deletes: number;
}

const COLORS = ["#22c55e", "#3b82f6", "#ef4444"];

export function ActionBreakdownChart({ pushes, pulls, deletes }: Props) {
	const data = [
		{ name: "Pushes", value: pushes },
		{ name: "Pulls", value: pulls },
		{ name: "Deletes", value: deletes },
	].filter((d) => d.value > 0);

	if (data.length === 0) {
		return (
			<div className="h-40 flex items-center justify-center text-sm text-zinc-400">No activity recorded yet</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={180}>
			<PieChart>
				<Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
					{data.map((_, i) => (
						<Cell key={i} fill={COLORS[i % COLORS.length]} />
					))}
				</Pie>
				<Tooltip
					contentStyle={{
						fontSize: 12,
						borderRadius: 6,
						border: "1px solid #e4e4e7",
						color: "#3f3f46",
					}}
				/>
				<Legend wrapperStyle={{ fontSize: 11 }} />
			</PieChart>
		</ResponsiveContainer>
	);
}
