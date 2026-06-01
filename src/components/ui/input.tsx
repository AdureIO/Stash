import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  labelClassName?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelClassName, error, className, id, ...props }, ref) => (
    <div className="space-y-1">
      {label && <label htmlFor={id} className={cn('block text-sm font-medium text-slate-700', labelClassName)}>{label}</label>}
      <input
        ref={ref}
        id={id}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 transition-colors',
          error ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:border-blue-500',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
