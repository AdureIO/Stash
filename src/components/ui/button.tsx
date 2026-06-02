import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'xs' | 'sm' | 'md'
}

const variants = {
  primary:   'bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 hover:border-blue-700',
  secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300',
  danger:    'bg-red-600 text-white hover:bg-red-700 border border-red-600',
  ghost:     'bg-transparent text-zinc-500 border border-transparent hover:bg-zinc-100 hover:text-zinc-800',
}

const sizes = {
  xs: 'h-6  px-2   text-xs  gap-1',
  sm: 'h-7  px-2.5 text-xs  gap-1.5',
  md: 'h-8  px-3   text-sm  gap-1.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-md transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'
