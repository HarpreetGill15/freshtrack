import { BarChart3, Home, ListChecks, MoreHorizontal, ScanLine } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

// One layout for everyone — clerks and managers see the same tabs. Back-office pages
// (Checks, Import, Settings, Help) live under More.
const MORE_PATHS = ['/more', '/checks', '/product-import', '/settings', '/help']
const navigation = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/todo', label: 'To-do', icon: ListChecks },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/more', label: 'More', icon: MoreHorizontal },
]

export function AppShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { pathname } = useLocation()
  const inMore = MORE_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
  return <div className="flex min-h-screen flex-col bg-ground">
    <header className="px-5 pb-2 pt-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-600 font-display text-lg font-extrabold text-white">F</span>
        <span className="font-display text-xl font-extrabold tracking-tight">FreshTrack</span>
      </div>
    </header>
    <main className={cn('mx-auto w-full max-w-3xl flex-1 px-5 pt-2', footer ? 'pb-48' : 'pb-28')}>{children}</main>
    {footer && <div className="fixed inset-x-0 bottom-[76px] z-30 bg-ground/95 px-5 pb-3 pt-3 backdrop-blur"><div className="mx-auto max-w-3xl">{footer}</div></div>}
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white pb-[max(env(safe-area-inset-bottom),8px)]">
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-1 pt-1.5">
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex min-h-[52px] flex-col items-center justify-center gap-1 text-xs font-bold', (to === '/more' ? inMore : isActive) ? 'text-brand-600' : 'text-muted')}>
          <Icon size={22} strokeWidth={2.2} aria-hidden="true" />{label}
        </NavLink>)}
      </div>
    </nav>
  </div>
}
