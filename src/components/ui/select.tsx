import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className, id, children, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-zinc-600">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full h-8 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900',
          'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors',
          'appearance-none bg-no-repeat bg-right',
          className,
        )}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', paddingRight: '30px' }}
        {...props}
      >
        {children}
      </select>
    </div>
  )
)
Select.displayName = 'Select'
