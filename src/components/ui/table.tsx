import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm border-collapse', className)}>{children}</table>
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn(
      'px-4 py-2.5 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider',
      'border-b border-zinc-100 bg-zinc-50/60',
      className,
    )}>
      {children}
    </th>
  )
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-50">{children}</tbody>
}

export function Tr({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn('group transition-colors hover:bg-zinc-50/70', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-4 py-3 text-zinc-700 align-middle', className)}>
      {children}
    </td>
  )
}
