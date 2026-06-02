import { cn } from '@/lib/utils'

interface CardProps { className?: string; children: React.ReactNode }

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn('bg-white border border-zinc-200 rounded-lg', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-3.5 border-b border-zinc-100', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children }: CardProps) {
  return <h2 className={cn('text-sm font-semibold text-zinc-800 tracking-tight', className)}>{children}</h2>
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}
