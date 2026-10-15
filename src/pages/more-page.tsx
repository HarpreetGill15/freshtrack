import { ChevronRight, CircleHelp, FileUp, Lock, LogIn, LogOut, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from '../components/app-shell'
import { useAuth } from '../hooks/use-auth'

export function MorePage() {
  const { localAdmin, role, loading, signOut } = useAuth()
  const navigate = useNavigate()
  return <AppShell>
    <h1 className="text-2xl font-extrabold">More</h1>
    <nav aria-label="More" className="mt-4 overflow-hidden rounded-2xl bg-white">
      <Row to="/product-import" icon={<FileUp size={20} />} label="Import products" hint="Update the product list" locked={!localAdmin} />
      <Row to="/settings" icon={<Settings size={20} />} label="Settings" hint="Store settings and upgrades" locked={!localAdmin} />
      <Row to="/help" icon={<CircleHelp size={20} />} label="Help" hint="How to run a check" />
    </nav>
    {!loading && (localAdmin
      ? <button type="button" onClick={() => void signOut()} className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left font-bold"><LogOut size={20} className="text-muted" />Sign out ({role === 'manager' ? 'manager' : 'staff'})</button>
      : <button type="button" onClick={() => navigate('/login', { state: { from: '/more' } })} className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left font-bold"><LogIn size={20} className="text-muted" />Sign in</button>)}
    <p className="mt-3 text-sm text-muted">Anyone can scan, see the to-do list, and export checks. Signing in is needed to import products, change settings, or delete a check. The charts Dashboard needs the manager login.</p>
  </AppShell>
}

function Row({ to, icon, label, hint, locked = false }: { to: string; icon: ReactNode; label: string; hint: string; locked?: boolean }) {
  return <Link to={to} className="flex min-h-16 items-center gap-3 border-b border-hairline px-4 last:border-b-0">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">{icon}</span>
    <span className="min-w-0 flex-1"><span className="block font-bold">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    {locked && <Lock size={16} className="text-muted" aria-label="Sign-in required" />}
    <ChevronRight size={20} className="text-muted" aria-hidden="true" />
  </Link>
}
