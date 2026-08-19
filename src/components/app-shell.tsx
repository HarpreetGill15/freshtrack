import { BarChart3, ClipboardList, FileUp, ScanLine, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/checks', label: 'Checks', icon: ClipboardList },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/product-import', label: 'Import', icon: FileUp },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-slate-50 pb-20">
    <header className="border-b border-slate-200 bg-white px-5 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-black text-white">F</span><div><h1 className="font-bold text-brand-700">FreshTrack</h1><p className="text-xs text-slate-500">Grocery freshness management</p></div></div>
    </header>
    <section className="mx-auto max-w-3xl p-5">{children}</section>
    <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-3xl justify-around">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => cn('flex min-w-20 flex-col items-center gap-1 px-4 py-3 text-xs font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}><Icon size={20}/>{label}</NavLink>)}</div></nav>
  </main>
}
