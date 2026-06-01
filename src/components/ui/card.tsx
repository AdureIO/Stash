import { cn } from '@/lib/utils'

interface CardProps { className?: string; children: React.ReactNode }

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children }: CardProps) {
  return <div className={cn('px-5 py-4 border-b border-slate-100', className)}>{children}</div>
}

export function CardTitle({ className, children }: CardProps) {
  return <h2 className={cn('text-sm font-semibold text-slate-800', className)}>{children}</h2>
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}
