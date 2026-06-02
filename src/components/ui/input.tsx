import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  labelClassName?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, labelClassName, error, hint, className, id, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className={cn('block text-xs font-medium text-zinc-600', labelClassName)}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'w-full h-8 px-3 text-sm rounded-md border bg-white text-zinc-900',
          'placeholder:text-zinc-400 transition-colors',
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/10'
            : 'border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10',
          className,
        )}
        {...props}
      />
      {hint && !error && <p className="text-[11px] text-zinc-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
