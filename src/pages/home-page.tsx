import { ChevronRight, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { getActiveCodeDateCheck } from '../services/code-date-check-service'
import { countCodeDatesForCheck, getDashboardEntries } from '../services/product-service'
import { todoCounts } from '../lib/dates'
import type { CodeDateCheck, DashboardEntry } from '../types/domain'

export function HomePage() {
  const navigate = useNavigate()
  const [activeCheck, setActiveCheck] = useState<CodeDateCheck | null>(null)
  const [scanned, setScanned] = useState<number | null>(null)
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([
      getActiveCodeDateCheck({ verify: true }).then(check => {
        setActiveCheck(check)
        if (check) countCodeDatesForCheck(check.id).then(setScanned).catch(() => setScanned(null))
      }).catch(() => setActiveCheck(null)),
      getDashboardEntries().then(setEntries).catch(() => setEntries([])),
    ]).finally(() => setLoading(false))
  }, [])

  const counts = todoCounts(entries)
  const show = (value: number) => loading ? '–' : String(value)

  return <AppShell>
    {activeCheck && <section className="rounded-[20px] bg-brand-600 p-5 text-white">
      <p className="text-[13px] font-bold uppercase tracking-wider text-brand-100">Check in progress</p>
      <h1 className="mt-3 text-2xl font-extrabold leading-tight">{activeCheck.name}</h1>
      <p className="mt-1 text-[15px] text-brand-100">{activeCheck.department} · {activeCheck.month}{scanned != null ? ` · ${scanned} item${scanned === 1 ? '' : 's'} scanned` : ''}</p>
      <Link to="/scan" className="mt-4 flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-white text-lg font-bold text-brand-600"><ScanLine size={22} aria-hidden="true" />Continue scanning</Link>
    </section>}

    <section className={activeCheck ? 'mt-5' : ''} aria-labelledby="today-heading">
      <h2 id="today-heading" className="text-[17px] font-semibold">Today on the floor</h2>
      <div className="mt-2 space-y-2">
        <TodoRow to="/todo?tab=marked_down" value={show(counts.rechecks)} tone="text-recheck" label="Markdowns to recheck" hint="Due today — check if they sold" highlighted={counts.rechecks > 0} />
        <TodoRow to="/todo?tab=today" value={show(counts.todayOrOverdue)} tone="text-overdue" label="Expire today or overdue" hint="Pull or mark down" />
        <TodoRow to="/todo?tab=next5" value={show(counts.next5)} tone="text-soon" label="Expire in the next 5 days" hint="Plan markdowns" />
      </div>
    </section>

    <Button variant={activeCheck ? 'secondary' : 'primary'} className="mt-5 w-full" onClick={() => navigate('/checks/new')}>Start a new check</Button>
  </AppShell>
}

function TodoRow({ to, value, tone, label, hint, highlighted = false }: { to: string; value: string; tone: string; label: string; hint: string; highlighted?: boolean }) {
  return <Link to={to} className={`flex min-h-16 items-center gap-3.5 rounded-2xl bg-white px-4 py-3 ${highlighted ? 'ring-2 ring-recheck' : ''}`}>
    <span className={`min-w-9 font-display text-[28px] font-extrabold ${tone}`}>{value}</span>
    <span className="flex-1"><span className="block font-bold">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    <ChevronRight size={20} className="text-muted" aria-hidden="true" />
  </Link>
}
