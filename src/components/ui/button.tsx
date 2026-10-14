import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'secondary' | 'danger'

/** Large, bold, 48px-tall by default — built for quick taps on the sales floor. */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>(({ className, variant = 'primary', ...props }, ref) =>
  <button ref={ref} className={cn(
    'inline-flex min-h-12 items-center justify-center rounded-2xl px-4 text-base font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
    variant === 'secondary' && 'border-2 border-line bg-white text-ink hover:bg-ground',
    variant === 'danger' && 'bg-overdue text-white hover:opacity-90',
    className,
  )} {...props} />)
Button.displayName = 'Button'
