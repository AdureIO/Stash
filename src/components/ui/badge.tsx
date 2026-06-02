import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; className?: string }

const variants: Record<BadgeVariant, string> = {
  default: 'bg-zinc-100    text-zinc-600',
  success: 'bg-emerald-50  text-emerald-700',
  warning: 'bg-amber-50    text-amber-700',
  danger:  'bg-red-50      text-red-600',
  info:    'bg-blue-50     text-blue-700',
  purple:  'bg-purple-50   text-purple-700',
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-none',
      variants[variant],
      className,
    )}>
      {children}
    </span>
  )
}
