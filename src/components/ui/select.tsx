import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, id, children, ...props }, ref) => (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>}
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
)
Select.displayName = 'Select'
