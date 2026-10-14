import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The one pop-up the to-do list uses — mark down, "still here", and "new stock" all open this same
 * sheet from the bottom of the screen, where thumbs already are. Tapping the dimmed area or pressing
 * Escape closes it.
 */
export function BottomSheet({ label, eyebrow, title, subtitle, onClose, children }: { label: string; eyebrow?: string; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    sheet.current?.focus()
    return () => previous?.focus?.()
  }, [])
  return <div className="fixed inset-0 z-50 flex flex-col justify-end">
    <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/60" />
    <div ref={sheet} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') onClose() }}
      className="relative mx-auto w-full max-w-3xl rounded-t-3xl bg-white px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3 outline-none">
      <div className="mx-auto h-1.5 w-11 rounded-full bg-line" aria-hidden="true" />
      {eyebrow && <p className="mt-4 text-[13px] font-bold uppercase tracking-wider text-soon">{eyebrow}</p>}
      <h2 className={`${eyebrow ? 'mt-1' : 'mt-4'} text-[22px] font-extrabold leading-tight`}>{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  </div>
}
