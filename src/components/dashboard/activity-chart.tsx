'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  data: { day: string; count: number }[]
}

export function ActivityChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-slate-400">
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
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={28} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          cursor={{ fill: '#f8fafc' }}
        />
        <Bar dataKey="events" fill="#3b82f6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
