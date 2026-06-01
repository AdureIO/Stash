import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => {
    const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none'
    const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700',
      secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
      danger: 'bg-red-600 text-white hover:bg-red-700',
      ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    }
    return (
      <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...props} />
    )
  }
)
Button.displayName = 'Button'
