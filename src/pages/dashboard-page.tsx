import { CalendarDays, Check, CheckCircle2, ClipboardList, Percent, Search, Trash2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { getDashboardEntries, setCodeDateStatus } from '../services/product-service'
import type { DashboardEntry, ProductStatus } from '../types/domain'

type Tab = 'all' | 'today' | 'next5' | 'marked_down' | 'cleared' | 'removed'
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'All active' }, { id: 'today', label: 'Today' }, { id: 'next5', label: 'Next 5 Days' }, { id: 'marked_down', label: 'Marked Down' }, { id: 'cleared', label: 'Cleared' }, { id: 'removed', label: 'Removed' }]
const OPERATIONAL_STATUSES: ProductStatus[] = ['active', 'marked_down']
const daysUntil = (date: Date) => Math.ceil((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
function bucketLabel(days: number) { if (days < 0) return `${Math.abs(days)}D OVERDUE`; if (days === 0) return 'TODAY'; if (days === 1) return 'TOMORROW'; if (days <= 5) return `${days} DAYS`; return 'LATER' }
function bucketTone(days: number) { if (days <= 0) return 'red' as const; if (days === 1) return 'orange' as const; if (days <= 5) return 'yellow' as const; return 'green' as const }
const TONE_CLASSES = { red: ['bg-red-500', 'bg-red-50 text-red-700'], orange: ['bg-orange-500', 'bg-orange-50 text-orange-700'], yellow: ['bg-yellow-400', 'bg-yellow-50 text-yellow-800'], green: ['bg-brand-500', 'bg-brand-50 text-brand-700'], slate: ['bg-slate-300', 'bg-slate-100 text-slate-500'] } as const

const byQtyDesc = (a: DashboardEntry, b: DashboardEntry) => b.quantity - a.quantity

/** LATER can span several weeks of items — sub-grouped by exact date so the list stays scannable instead of one long undifferentiated block. */
function groupByDate(items: DashboardEntry[]) {
  const map = new Map<string, DashboardEntry[]>()
  for (const item of items) { const key = item.expirationDate.toDateString(); const list = map.get(key) ?? []; list.push(item); map.set(key, list) }
  return [...map.entries()]
    .map(([key, dateItems]) => [key, [...dateItems].sort(byQtyDesc)] as const)
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
}

export function DashboardPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [operational, setOperational] = useState<DashboardEntry[]>([])
  const [resolved, setResolved] = useState<DashboardEntry[]>([])
  const [search, setSearch] = useState(''); const [department, setDepartment] = useState('all')
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')

  const loadOperational = useCallback(async () => { try { setOperational(await getDashboardEntries(OPERATIONAL_STATUSES)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the dashboard.') } }, [])

  useEffect(() => { setLoading(true); void loadOperational().finally(() => setLoading(false)) }, [loadOperational])
  useEffect(() => {
    if (tab !== 'cleared' && tab !== 'removed') return
    setLoading(true)
    getDashboardEntries([tab]).then(setResolved).catch(e => setError(e instanceof Error ? e.message : 'Could not load.')).finally(() => setLoading(false))
  }, [tab])

  async function updateStatus(id: string, status: ProductStatus, recheckAt?: Date) {
    try { await setCodeDateStatus(id, status, recheckAt); await loadOperational() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update status.') }
  }

  const source = tab === 'cleared' || tab === 'removed' ? resolved : operational
  const departments = useMemo(() => [...new Set(source.map(i => i.department).filter(Boolean))].sort(), [source])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return source.filter(item => {
      if (department !== 'all' && item.department !== department) return false
      if (q && !`${item.productName} ${item.upc} ${item.department}`.toLowerCase().includes(q)) return false
      if (tab === 'today') return item.status === 'active' && daysUntil(item.expirationDate) <= 0
      if (tab === 'next5') return item.status === 'active' && daysUntil(item.expirationDate) <= 5
      if (tab === 'marked_down') return item.status === 'marked_down'
      return true
    })
  }, [source, department, search, tab])

  const activeItems = filtered.filter(i => i.status === 'active')
  const markedDownItems = useMemo(() => filtered.filter(i => i.status === 'marked_down').sort(byQtyDesc), [filtered])
  const doneItems = useMemo(() => [...filtered].sort(byQtyDesc), [filtered])
  const buckets = useMemo(() => {
    const map = new Map<string, DashboardEntry[]>()
    for (const item of activeItems) { const key = bucketLabel(daysUntil(item.expirationDate)); const list = map.get(key) ?? []; list.push(item); map.set(key, list) }
    return [...map.entries()]
      .map(([label, items]) => ({ label, items: [...items].sort(byQtyDesc), minDays: Math.min(...items.map(i => daysUntil(i.expirationDate))) }))
      .sort((a, b) => a.minDays - b.minDays)
  }, [activeItems])

  const firstCardId = tab === 'marked_down' ? markedDownItems[0]?.id : buckets[0]?.items[0]?.id

  const stats = useMemo(() => ({
    overdue: operational.filter(i => i.status === 'active' && daysUntil(i.expirationDate) < 0).length,
    today: operational.filter(i => i.status === 'active' && daysUntil(i.expirationDate) === 0).length,
    next5: operational.filter(i => i.status === 'active' && daysUntil(i.expirationDate) >= 1 && daysUntil(i.expirationDate) <= 5).length,
    markedDown: operational.filter(i => i.status === 'marked_down').length,
  }), [operational])

  return <AppShell>
    <div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">Expiry dashboard</h2><p className="mt-1 text-sm text-slate-500">Grouped by expiration, highest quantity first in each group.</p></div><Link to="/scan"><Button>Scan item</Button></Link></div>

    <div className="mt-4 grid grid-cols-4 gap-1.5">
      <StatPill label="Overdue" value={stats.overdue} tone="bg-red-50 text-red-700" />
      <StatPill label="Due Today" value={stats.today} tone="bg-orange-50 text-orange-700" />
      <StatPill label="Next 5d" value={stats.next5} tone="bg-yellow-50 text-yellow-800" />
      <StatPill label="Marked Down" value={stats.markedDown} tone="bg-amber-50 text-amber-800" />
    </div>

    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{t.label}</button>)}</div>

    <div className="mt-3 rounded-2xl bg-white p-3 shadow-card">
      <label className="relative block"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input className="w-full rounded-xl border bg-white py-3 pl-10 pr-3 text-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, UPC" /></label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setDepartment('all')} className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${department === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>All departments</button>
        {departments.map(d => <button key={d} onClick={() => setDepartment(d)} className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${department === d ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{d}</button>)}
      </div>
    </div>

    <section className="mt-5 space-y-5">
      {loading ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Loading…</p>
        : error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        : !filtered.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><CalendarDays className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">Nothing here</p><p className="mt-1 text-sm text-slate-500">Scan a product and add an expiration date to see it here.</p></div>
        : <>
          {tab !== 'marked_down' && buckets.length > 0 && <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><ClipboardList size={15} className="text-slate-400"/>Needs Initial Action</h3>
            <div className="space-y-4">{buckets.map(({ label, items }) => label === 'LATER'
              ? <div key={label}>
                  <div className="mb-1.5 flex items-baseline justify-between"><span className="text-xs font-bold tracking-wide text-slate-500">{label}</span><span className="text-xs text-slate-400">{items.length}</span></div>
                  <div className="space-y-3">{groupByDate(items).map(([dateKey, dateItems]) => <div key={dateKey}>
                    <p className="mb-1 text-xs font-semibold text-slate-400">{shortDate(new Date(dateKey))}</p>
                    <div className="space-y-1.5">{dateItems.map(item => <Card key={item.id} item={item} onStatus={updateStatus} showLegend={item.id === firstCardId}/>)}</div>
                  </div>)}</div>
                </div>
              : <div key={label}>
                  <div className="mb-1.5 flex items-baseline justify-between"><span className="text-xs font-bold tracking-wide text-slate-500">{label}</span><span className="text-xs text-slate-400">{items.length}</span></div>
                  <div className="space-y-1.5">{items.map(item => <Card key={item.id} item={item} onStatus={updateStatus} showLegend={item.id === firstCardId}/>)}</div>
                </div>)}</div>
          </div>}
          {tab !== 'today' && tab !== 'next5' && markedDownItems.length > 0 && <div>
            <h3 className="mb-2 text-sm font-bold text-amber-700">Marked Down — Recheck Required</h3>
            <div className="space-y-1.5">{markedDownItems.map(item => <Card key={item.id} item={item} onStatus={updateStatus} showLegend={item.id === firstCardId}/>)}</div>
          </div>}
          {(tab === 'cleared' || tab === 'removed') && <div className="space-y-1.5">{doneItems.map(item => <Card key={item.id} item={item} onStatus={updateStatus}/>)}</div>}
        </>}
    </section>
  </AppShell>
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`rounded-lg px-1.5 py-1.5 text-center ${tone}`}>
    <p className="text-base font-black leading-none sm:text-xl">{value}</p>
    <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight sm:text-xs">{label}</p>
  </div>
}

const ICON_BUTTON_TONES = { default: 'border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200', danger: 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100', success: 'border border-green-200 bg-green-50 text-green-600 hover:bg-green-100' } as const
function IconButton({ label, tone = 'default', onClick, children }: { label: string; tone?: keyof typeof ICON_BUTTON_TONES; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${ICON_BUTTON_TONES[tone]}`}>{children}</button>
}

/** Die-cut ticket notches (clip-path) plus a dashed "tear line" make the mark-down action read as a discount coupon rather than a generic tag icon — kept pastel so it doesn't outshine the qty badge next to it. */
function MarkDownButton({ onClick }: { onClick: () => void }) {
  return <button
    type="button"
    title="Mark down"
    aria-label="Mark down"
    onClick={onClick}
    style={{ clipPath: 'polygon(0% 0%,100% 0%,100% 38%,92% 50%,100% 62%,100% 100%,0% 100%,0% 62%,8% 50%,0% 38%)' }}
    className="relative grid h-8 w-14 shrink-0 place-items-center border border-orange-200 bg-orange-100 text-orange-600 transition hover:bg-orange-200"
  >
    <span className="pointer-events-none absolute inset-y-1.5 left-1/2 -translate-x-1/2 border-l border-dashed border-orange-300" />
    <Percent size={13} strokeWidth={3} />
  </button>
}

/** Quantity is the number staff scan the shelf for — sized by magnitude so the big markdowns jump out of the list, kept pastel to match the lighter action buttons. */
function QtyBadge({ quantity }: { quantity: number }) {
  const tone = quantity >= 15 ? 'bg-red-100 text-red-700' : quantity >= 8 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
  return <div className={`grid shrink-0 place-items-center rounded-lg px-2.5 py-1.5 leading-none ${tone}`}>
    <span className="text-base font-black">{quantity}</span>
    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide opacity-70">qty</span>
  </div>
}

function Card({ item, onStatus, showLegend = false }: { item: DashboardEntry; onStatus: (id: string, status: ProductStatus, recheckAt?: Date) => void; showLegend?: boolean }) {
  const days = daysUntil(item.expirationDate)
  const isDone = item.status === 'cleared' || item.status === 'removed'
  const tone = item.status === 'marked_down' ? 'orange' : isDone ? 'slate' : bucketTone(days)
  const [bar] = TONE_CLASSES[tone]
  const [markingDown, setMarkingDown] = useState(false)
  const [recheckDate, setRecheckDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const meta = `${item.department} · ${shortDate(item.expirationDate)}${item.status === 'marked_down' && item.recheckAt ? ` · Recheck ${shortDate(item.recheckAt)}` : ''}`

  return <article className={`overflow-hidden rounded-xl bg-white shadow-card ${isDone ? 'opacity-70' : ''}`}>
    {showLegend && !markingDown && <div className="flex justify-end gap-1.5 border-b border-slate-100 bg-slate-50 pb-1 pr-2.5 pt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">
      {item.status === 'active' && <span className="w-14 text-center">Mark down</span>}
      <span className="w-8 text-center">Sold</span>
      <span className="w-8 text-center">Remove</span>
    </div>}
    <div className="flex items-stretch gap-2.5 pr-2.5">
      <div className={`w-1.5 shrink-0 ${bar}`}/>
      <div className="min-w-0 flex-1 py-2">
        <h4 className="truncate text-sm font-bold text-slate-900">{item.productName}</h4>
        <p className="truncate text-xs text-slate-500">{meta}</p>
      </div>

      <div className="flex shrink-0 items-center"><QtyBadge quantity={item.quantity} /></div>

      {item.status === 'active' && !markingDown && <div className="flex shrink-0 items-center gap-1.5">
        <MarkDownButton onClick={() => setMarkingDown(true)} />
        <IconButton label="Cleared" tone="success" onClick={() => onStatus(item.id, 'cleared')}><Check size={15}/></IconButton>
        <IconButton label="Removed" tone="danger" onClick={() => onStatus(item.id, 'removed')}><Trash2 size={15}/></IconButton>
      </div>}
      {item.status === 'marked_down' && <div className="flex shrink-0 items-center gap-1">
        <IconButton label="Cleared" tone="success" onClick={() => onStatus(item.id, 'cleared')}><Check size={15}/></IconButton>
        <IconButton label="Removed" tone="danger" onClick={() => onStatus(item.id, 'removed')}><Trash2 size={15}/></IconButton>
      </div>}
      {isDone && <div className="flex shrink-0 items-center pr-0.5 text-slate-400">
        {item.status === 'cleared' ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}
      </div>}
    </div>
    {item.status === 'active' && markingDown && <div className="border-t border-slate-100 bg-amber-50 p-3">
      <label className="text-xs font-semibold text-amber-800">Recheck date<input type="date" className="mt-1 w-full rounded-lg border p-2 text-sm" value={recheckDate} onChange={e => setRecheckDate(e.target.value)} /></label>
      <div className="mt-2 flex gap-2"><Button variant="secondary" className="min-h-8 flex-1 px-2 text-xs" onClick={() => setMarkingDown(false)}>Cancel</Button><Button className="min-h-8 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'marked_down', new Date(`${recheckDate}T12:00:00`))}>Confirm</Button></div>
    </div>}
  </article>
}
