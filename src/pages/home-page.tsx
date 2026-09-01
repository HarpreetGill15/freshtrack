import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, ScanLine, TrendingDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { getActiveCodeDateCheck } from '../services/code-date-check-service'
import { getDashboardEntries } from '../services/product-service'
import type { CodeDateCheck, DashboardEntry } from '../types/domain'

const daysUntil = (date: Date) => Math.ceil((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
const recheckDue = (item: DashboardEntry) => item.status === 'marked_down' && item.recheckAt != null && daysUntil(item.recheckAt) <= 0

const STAT_TILES = [
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'bg-red-50 text-red-700', tab: 'today' },
  { key: 'today', label: 'Due Today', icon: CalendarClock, tone: 'bg-orange-50 text-orange-700', tab: 'today' },
  { key: 'week', label: 'Due This Week', icon: ClipboardList, tone: 'bg-yellow-50 text-yellow-800', tab: 'next5' },
  { key: 'markedDown', label: 'Marked Down', icon: TrendingDown, tone: 'bg-amber-50 text-amber-800', tab: 'marked_down' },
] as const

export function HomePage() {
  const navigate = useNavigate()
  const [activeCheck, setActiveCheck] = useState<CodeDateCheck | null>(null)
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([
      getActiveCodeDateCheck().then(setActiveCheck).catch(() => setActiveCheck(null)),
      getDashboardEntries().then(setEntries).catch(() => setEntries([])),
    ]).finally(() => setLoading(false))
  }, [])

  const counts = {
    overdue: entries.filter(e => e.status === 'active' && daysUntil(e.expirationDate) < 0).length,
    today: entries.filter(e => e.status === 'active' && daysUntil(e.expirationDate) === 0).length,
    week: entries.filter(e => e.status === 'active' && daysUntil(e.expirationDate) > 0 && daysUntil(e.expirationDate) <= 6).length,
    markedDown: entries.filter(e => e.status === 'marked_down').length,
  }
  const recheckDueCount = entries.filter(recheckDue).length

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-white p-5">
      <div className="mx-auto w-full max-w-md py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-600 text-2xl font-black text-white shadow-sm">F</div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">FreshTrack</h1>
            <p className="text-sm text-slate-500">Grocery code-date management · no sign-in required to run a check</p>
          </div>
        </div>

        {!loading && recheckDueCount > 0 && (
          <Link to="/dashboard?tab=marked_down" className="mb-4 flex items-center justify-between gap-2 rounded-2xl border-2 border-amber-400 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900 shadow-sm animate-pulse">
            <span className="flex items-center gap-2"><TrendingDown size={16} />{recheckDueCount} marked-down item{recheckDueCount === 1 ? '' : 's'} due for recheck</span>
            <ArrowRight size={16} className="shrink-0" />
          </Link>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3">
          {STAT_TILES.map(tile => (
            <Link key={tile.key} to={`/dashboard?tab=${tile.tab}`} className={`rounded-2xl p-4 transition active:scale-95 ${tile.tone}`}>
              <tile.icon size={18} />
              <p className="mt-2 text-2xl font-black leading-none">{loading ? '–' : counts[tile.key]}</p>
              <p className="mt-1 text-xs font-semibold">{tile.label}</p>
            </Link>
          ))}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-card">
          {!loading && activeCheck && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
              <ClipboardList size={18} className="shrink-0" />
              <span><strong>{activeCheck.name}</strong> · {activeCheck.department} · {activeCheck.month} is in progress.</span>
            </div>
          )}

          {!loading && activeCheck && (
            <Button className="w-full" onClick={() => navigate('/scan')}>
              <ScanLine size={17} className="mr-2" />Continue scanning
            </Button>
          )}

          <Button className={!loading && activeCheck ? 'mt-3 w-full' : 'w-full'} variant={!loading && activeCheck ? 'secondary' : 'primary'} onClick={() => navigate('/checks/new')}>
            <ClipboardList size={17} className="mr-2" />Start new Code Date Check
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Staff dashboard, product import, and settings live under{' '}
          <Link to="/dashboard" className="inline-flex items-center gap-0.5 font-semibold text-brand-600">Dashboard<ArrowRight size={12} /></Link>
        </p>
      </div>
    </main>
  )
}
