import { cn } from '@/lib/utils'

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  )
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-slate-100">{children}</thead>
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide', className)}>
      {children}
    </th>
  )
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-50">{children}</tbody>
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-slate-50 transition-colors', className)}>{children}</tr>
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-4 py-3 text-slate-700', className)}>{children}</td>
}
