import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }>(({ className, variant = 'primary', ...props }, ref) => <button ref={ref} className={cn('inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700', variant === 'secondary' && 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50', variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700', className)} {...props} />)
Button.displayName = 'Button'
