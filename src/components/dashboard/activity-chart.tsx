'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  data: { day: string; count: number }[]
}

export function ActivityChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-zinc-400">
        No activity in the last 30 days
      </div>
    )
  }

  const formatted = data.map(d => ({
    day: new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    events: d.count,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={formatted} barSize={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', color: '#3f3f46' }}
          cursor={{ fill: '#fafafa' }}
        />
        <Bar dataKey="events" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
