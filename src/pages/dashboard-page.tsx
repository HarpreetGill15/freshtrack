import { CalendarDays, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { getDashboardEntries, setCodeDateStatus } from '../services/product-service'
import type { DashboardEntry, ProductStatus } from '../types/domain'

type Tab = 'all' | 'today' | 'next5' | 'marked_down' | 'cleared' | 'removed'
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'All active' }, { id: 'today', label: 'Today' }, { id: 'next5', label: 'Next 5 Days' }, { id: 'marked_down', label: 'Marked Down' }, { id: 'cleared', label: 'Cleared' }, { id: 'removed', label: 'Removed' }]
const OPERATIONAL_STATUSES: ProductStatus[] = ['active', 'marked_down']
const daysUntil = (date: Date) => Math.ceil((new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
function bucketLabel(days: number) { if (days < 0) return `${Math.abs(days)}D OVERDUE`; if (days === 0) return 'TODAY'; if (days === 1) return 'TOMORROW'; if (days <= 5) return `${days} DAYS`; return 'LATER' }
function bucketTone(days: number) { if (days <= 0) return 'red' as const; if (days === 1) return 'orange' as const; if (days <= 5) return 'yellow' as const; return 'green' as const }
const TONE_CLASSES = { red: ['bg-red-500', 'bg-red-50 text-red-700'], orange: ['bg-orange-500', 'bg-orange-50 text-orange-700'], yellow: ['bg-yellow-400', 'bg-yellow-50 text-yellow-800'], green: ['bg-brand-500', 'bg-brand-50 text-brand-700'] } as const

export function DashboardPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [operational, setOperational] = useState<DashboardEntry[]>([])
  const [resolved, setResolved] = useState<DashboardEntry[]>([])
  const [search, setSearch] = useState(''); const [department, setDepartment] = useState('all'); const [section, setSection] = useState('all')
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
  const sections = useMemo(() => [...new Set(source.filter(i => department === 'all' || i.department === department).map(i => i.section).filter(Boolean))].sort(), [source, department])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return source.filter(item => {
      if (department !== 'all' && item.department !== department) return false
      if (section !== 'all' && item.section !== section) return false
      if (q && !`${item.productName} ${item.upc} ${item.department} ${item.section}`.toLowerCase().includes(q)) return false
      if (tab === 'today') return item.status === 'active' && daysUntil(item.expirationDate) <= 0
      if (tab === 'next5') return item.status === 'active' && daysUntil(item.expirationDate) <= 5
      if (tab === 'marked_down') return item.status === 'marked_down'
      return true
    })
  }, [source, department, section, search, tab])

  const activeItems = filtered.filter(i => i.status === 'active')
  const markedDownItems = filtered.filter(i => i.status === 'marked_down')
  const buckets = useMemo(() => {
    const map = new Map<string, DashboardEntry[]>()
    for (const item of activeItems) { const key = bucketLabel(daysUntil(item.expirationDate)); const list = map.get(key) ?? []; list.push(item); map.set(key, list) }
    return [...map.entries()]
      .map(([label, items]) => ({ label, items, minDays: Math.min(...items.map(i => daysUntil(i.expirationDate))) }))
      .sort((a, b) => a.minDays - b.minDays)
  }, [activeItems])

  return <AppShell>
    <div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">Expiry dashboard</h2><p className="mt-1 text-sm text-slate-500">Sorted by nearest expiration, urgent items first.</p></div><Link to="/scan"><Button>Scan item</Button></Link></div>

    <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{t.label}</button>)}</div>

    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input className="w-full rounded-xl border bg-white py-3 pl-10 pr-3 text-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, UPC" /></label>
      <select className="rounded-xl border bg-white p-3 text-sm sm:w-40" value={department} onChange={e => { setDepartment(e.target.value); setSection('all') }}><option value="all">All areas</option>{departments.map(d => <option key={d}>{d}</option>)}</select>
      <select className="rounded-xl border bg-white p-3 text-sm sm:w-40" value={section} onChange={e => setSection(e.target.value)}><option value="all">All sections</option>{sections.map(s => <option key={s}>{s}</option>)}</select>
    </div>

    <section className="mt-6 space-y-8">
      {loading ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Loading…</p>
        : error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        : !filtered.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><CalendarDays className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">Nothing here</p><p className="mt-1 text-sm text-slate-500">Scan a product and add an expiration date to see it here.</p></div>
        : <>
          {tab !== 'marked_down' && buckets.length > 0 && <div>
            <h3 className="mb-3 font-bold text-slate-700">Needs Initial Action</h3>
            <div className="space-y-6">{buckets.map(({ label, items }) => <div key={label}><div className="mb-2 flex items-baseline justify-between"><span className="text-xs font-bold tracking-wide text-slate-500">{label}</span><span className="text-xs text-slate-400">{items.length}</span></div><div className="space-y-3">{items.map(item => <Card key={item.id} item={item} onStatus={updateStatus}/>)}</div></div>)}</div>
          </div>}
          {tab !== 'today' && tab !== 'next5' && markedDownItems.length > 0 && <div>
            <h3 className="mb-3 font-bold text-amber-700">Marked Down — Recheck Required</h3>
            <div className="space-y-3">{markedDownItems.map(item => <Card key={item.id} item={item} onStatus={updateStatus}/>)}</div>
          </div>}
          {(tab === 'cleared' || tab === 'removed') && <div className="space-y-3">{filtered.map(item => <Card key={item.id} item={item} onStatus={updateStatus}/>)}</div>}
        </>}
    </section>
  </AppShell>
}

function Card({ item, onStatus }: { item: DashboardEntry; onStatus: (id: string, status: ProductStatus, recheckAt?: Date) => void }) {
  const days = daysUntil(item.expirationDate)
  const tone = item.status === 'marked_down' ? 'orange' : bucketTone(days)
  const [bar, badge] = TONE_CLASSES[tone]
  const [markingDown, setMarkingDown] = useState(false)
  const [recheckDate, setRecheckDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  return <article className="overflow-hidden rounded-2xl bg-white shadow-card">
    <div className="flex">
      <div className={`w-1.5 ${bar}`}/>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h4 className="truncate font-bold">{item.productName}</h4><p className="mt-1 text-xs text-slate-500">{item.department}{item.section ? ` / ${item.section}` : ''} · UPC {item.upc}</p></div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${badge}`}>{item.status === 'marked_down' ? 'Recheck' : bucketLabel(days)}</span>
        </div>
        <div className="mt-4 flex justify-between text-sm text-slate-500"><span>{item.expirationDate.toLocaleDateString()}</span><span>Qty {item.quantity}</span></div>
        {item.status === 'marked_down' && item.recheckAt && <p className="mt-2 text-xs font-medium text-amber-700">Recheck by {item.recheckAt.toLocaleDateString()}</p>}

        {item.status === 'active' && !markingDown && <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" onClick={() => setMarkingDown(true)}>Mark Down</Button>
          <Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'cleared')}>Cleared</Button>
          <Button variant="danger" className="min-h-9 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'removed')}>Removed</Button>
        </div>}
        {item.status === 'active' && markingDown && <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <label className="text-xs font-semibold text-amber-800">Recheck date<input type="date" className="mt-1 w-full rounded-lg border p-2 text-sm" value={recheckDate} onChange={e => setRecheckDate(e.target.value)} /></label>
          <div className="mt-2 flex gap-2"><Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" onClick={() => setMarkingDown(false)}>Cancel</Button><Button className="min-h-9 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'marked_down', new Date(`${recheckDate}T12:00:00`))}>Confirm</Button></div>
        </div>}
        {item.status === 'marked_down' && <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'cleared')}>Cleared</Button>
          <Button variant="danger" className="min-h-9 flex-1 px-2 text-xs" onClick={() => onStatus(item.id, 'removed')}>Removed</Button>
        </div>}
      </div>
    </div>
  </article>
}
