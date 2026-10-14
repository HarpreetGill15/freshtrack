import { CalendarDays, CheckCircle2, ChevronDown, Search, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { BottomSheet } from '../components/bottom-sheet'
import { Button } from '../components/ui/button'
import { addOrIncrementCodeDate, codeDateDetailsFromEntry, getDashboardEntries, setCodeDateStatus } from '../services/product-service'
import { findActiveCheckForMonth } from '../services/code-date-check-service'
import { addDays, currentMonth, daysUntil, fromInputDate, inputDate, recheckDue, shortDate, todoCounts } from '../lib/dates'
import type { CodeDateCheck, DashboardEntry, ProductStatus } from '../types/domain'

type Tab = 'all' | 'today' | 'next5' | 'marked_down' | 'cleared' | 'removed'
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'marked_down', label: 'Rechecks' }, { id: 'today', label: 'Today' }, { id: 'next5', label: 'Next 5 days' }, { id: 'cleared', label: 'Sold' }, { id: 'removed', label: 'Removed' }]
const OPERATIONAL_STATUSES: ProductStatus[] = ['active', 'marked_down']

type Sheet =
  | { kind: 'markdown'; item: DashboardEntry }
  | { kind: 'still_here'; item: DashboardEntry }
  | { kind: 'new_stock'; item: DashboardEntry }

const byQtyDesc = (a: DashboardEntry, b: DashboardEntry) => b.quantity - a.quantity
function bucketLabel(days: number) { if (days < 0) return 'Overdue'; if (days === 0) return 'Expires today'; if (days === 1) return 'Expires tomorrow'; if (days <= 5) return `In ${days} days`; return 'Later' }
function bucketColor(days: number) { if (days <= 0) return 'text-overdue'; if (days <= 5) return 'text-soon'; return 'text-muted' }

export function TodoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = TABS.find(t => t.id === searchParams.get('tab'))?.id ?? 'all'
  const setTab = useCallback((next: Tab) => setSearchParams(next === 'all' ? {} : { tab: next }, { replace: true }), [setSearchParams])
  const [operational, setOperational] = useState<DashboardEntry[]>([])
  const [resolved, setResolved] = useState<DashboardEntry[]>([])
  const [search, setSearch] = useState(''); const [department, setDepartment] = useState('all')
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)

  useEffect(() => { setLoading(true); getDashboardEntries(OPERATIONAL_STATUSES).then(setOperational).catch(e => setError(e instanceof Error ? e.message : 'Could not load the to-do list.')).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (tab !== 'cleared' && tab !== 'removed') return
    setLoading(true)
    getDashboardEntries([tab]).then(setResolved).catch(e => setError(e instanceof Error ? e.message : 'Could not load.')).finally(() => setLoading(false))
  }, [tab])

  /** Updates the card on screen straight away, then saves; puts it back if the save fails. */
  async function updateStatus(item: DashboardEntry, status: ProductStatus, recheckAt?: Date) {
    setOperational(items => items.map(i => i.id === item.id ? { ...i, status, recheckAt } : i))
    // Sold/Removed often means fresh stock went up — the same sheet asks for its date.
    if (status === 'cleared' || status === 'removed') setSheet({ kind: 'new_stock', item })
    else setSheet(null)
    try { await setCodeDateStatus(item.id, status, recheckAt) }
    catch (e) { setOperational(items => items.map(i => i.id === item.id ? item : i)); setError(e instanceof Error ? e.message : 'Could not update this item.') }
  }

  async function addNewStock(target: DashboardEntry, expirationDate: Date, quantity: number) {
    try {
      const result = await addOrIncrementCodeDate({ productId: target.productId, codeDateCheckId: target.codeDateCheckId, expirationDate, quantity }, codeDateDetailsFromEntry(target))
      if (result.merged) setOperational(items => items.map(i => i.id === result.id ? { ...i, quantity: result.quantity } : i))
      else setOperational(items => [...items, { ...target, id: result.id, status: 'active', quantity, expirationDate, recheckAt: undefined, createdAt: new Date() }])
      setSheet(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add the new date.') }
  }

  const source = tab === 'cleared' || tab === 'removed' ? resolved : operational
  const departments = useMemo(() => [...new Set(operational.map(i => i.department).filter(Boolean))].sort(), [operational])
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return source.filter(item => {
      // Items just marked Sold/Removed leave the open list right away.
      if (source === operational && !OPERATIONAL_STATUSES.includes(item.status)) return false
      if (department !== 'all' && item.department !== department) return false
      if (q && !`${item.productName} ${item.upc}`.toLowerCase().includes(q)) return false
      if (tab === 'today') return item.status === 'active' && daysUntil(item.expirationDate) <= 0
      if (tab === 'next5') return item.status === 'active' && daysUntil(item.expirationDate) <= 5
      if (tab === 'marked_down') return item.status === 'marked_down'
      return true
    })
  }, [source, operational, department, search, tab])

  const groups = useMemo(() => {
    if (tab === 'cleared' || tab === 'removed') return [{ label: tab === 'cleared' ? 'Sold' : 'Removed', color: 'text-muted', items: [...filtered].sort(byQtyDesc) }]
    const result: { label: string; color: string; items: DashboardEntry[] }[] = []
    const marked = filtered.filter(i => i.status === 'marked_down')
    const due = marked.filter(recheckDue).sort(byQtyDesc)
    const waiting = marked.filter(i => !recheckDue(i)).sort((a, b) => (a.recheckAt?.getTime() ?? 0) - (b.recheckAt?.getTime() ?? 0))
    if (due.length) result.push({ label: 'Recheck due now', color: 'text-recheck', items: due })
    const buckets = new Map<string, { days: number; items: DashboardEntry[] }>()
    for (const item of filtered.filter(i => i.status === 'active')) {
      const days = daysUntil(item.expirationDate)
      const label = bucketLabel(days)
      const bucket = buckets.get(label) ?? { days, items: [] }
      bucket.days = Math.min(bucket.days, days); bucket.items.push(item); buckets.set(label, bucket)
    }
    for (const [label, bucket] of [...buckets.entries()].sort((a, b) => a[1].days - b[1].days)) {
      const items = label === 'Later' ? [...bucket.items].sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime() || byQtyDesc(a, b)) : [...bucket.items].sort(byQtyDesc)
      result.push({ label, color: bucketColor(bucket.days), items })
    }
    if (waiting.length) result.push({ label: 'Marked down — recheck later', color: 'text-muted', items: waiting })
    return result
  }, [filtered, tab])

  const counts = useMemo(() => todoCounts(operational), [operational])
  const tabCount: Partial<Record<Tab, number>> = { marked_down: counts.markedDown, today: counts.todayOrOverdue, next5: counts.todayOrOverdue + counts.next5 }

  return <AppShell>
    <div className="flex items-baseline justify-between gap-3"><h1 className="text-2xl font-extrabold">To-do</h1><span className="text-sm text-muted">Everything that needs action</span></div>

    <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Filter">
      {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${tab === t.id ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
        {t.label}{tabCount[t.id] ? ` · ${tabCount[t.id]}` : ''}
      </button>)}
    </div>

    <div className="mt-3 flex gap-2">
      <label className="relative flex-1"><span className="sr-only">Search</span><Search className="absolute left-3.5 top-3 text-muted" size={20} aria-hidden="true"/><input className="min-h-11 w-full rounded-xl border border-line bg-white pl-11 pr-3" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or UPC" /></label>
      <label><span className="sr-only">Department</span><select value={department} onChange={e => setDepartment(e.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-bold"><option value="all">All depts</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-overdue">{error}</p>}

    <div className="mt-4 space-y-5">
      {loading ? <p className="rounded-2xl bg-white p-8 text-center text-muted">Loading…</p>
        : !filtered.length ? <div className="rounded-2xl border-2 border-dashed border-line bg-white p-10 text-center"><CalendarDays className="mx-auto text-muted" aria-hidden="true"/><p className="mt-3 font-bold">Nothing here</p><p className="mt-1 text-sm text-muted">Scan products and add expiry dates to fill this list.</p></div>
        : groups.map(group => <section key={group.label}>
          <div className="mb-2 flex items-baseline justify-between"><h2 className={`text-[13px] font-bold uppercase tracking-wider ${group.color}`}>{group.label}</h2><span className="text-[13px] text-muted">{group.items.length}</span></div>
          <div className="space-y-2">{group.items.map(item => <TodoCard key={item.id} item={item} onAction={(status) => void updateStatus(item, status)} onSheet={kind => setSheet({ kind, item })} />)}</div>
        </section>)}
    </div>

    {sheet && (sheet.kind === 'new_stock'
      ? <NewStockSheet item={sheet.item} onClose={() => setSheet(null)} onSave={addNewStock} />
      : <MarkDownSheet item={sheet.item} stillHere={sheet.kind === 'still_here'} onClose={() => setSheet(null)} onConfirm={recheckAt => void updateStatus(sheet.item, 'marked_down', recheckAt)} />)}
  </AppShell>
}

function TodoCard({ item, onAction, onSheet }: { item: DashboardEntry; onAction: (status: ProductStatus) => void; onSheet: (kind: Sheet['kind']) => void }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = item.status === 'cleared' || item.status === 'removed'
  const meta = item.status === 'marked_down'
    ? `${item.department} · expires ${shortDate(item.expirationDate)}${item.recheckAt ? ` · recheck ${shortDate(item.recheckAt)}` : ''}`
    : `${item.department} · ${shortDate(item.expirationDate)}`
  return <article className={`rounded-2xl bg-white px-3 pb-2.5 pt-3 ${isDone ? 'opacity-80' : ''}`}>
    <div className="flex items-start gap-2.5">
      <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
        <span className="min-w-0 flex-1"><span className="block font-bold leading-snug">{item.productName}</span><span className="mt-0.5 block text-[13px] text-muted">{meta}</span></span>
        <ChevronDown size={18} className={`mt-0.5 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true"/>
      </button>
      <div className="min-w-12 rounded-[10px] bg-ground px-2 py-1.5 text-center"><div className="font-display text-xl font-extrabold leading-none">{item.quantity}</div><div className="text-[11px] font-bold text-muted">qty</div></div>
    </div>
    {expanded && <div className="mt-2 rounded-xl bg-ground px-3 py-2.5 text-sm">
      <p className="font-mono text-xs font-bold text-muted">UPC {item.upc || '—'}</p>
      {item.description && item.description !== item.productName && <p className="mt-1">{item.description}</p>}
      <Link to={`/products/${item.productId}`} className="mt-1 inline-block py-1 text-sm font-bold text-brand-600">Open product page</Link>
    </div>}
    {isDone
      ? <div className="mt-2.5 flex items-center gap-2">
          <span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-muted">{item.status === 'cleared' ? <CheckCircle2 size={18} aria-hidden="true"/> : <XCircle size={18} aria-hidden="true"/>}{item.status === 'cleared' ? 'Sold' : 'Removed'}</span>
          <ActionButton tone="neutral" onClick={() => onSheet('new_stock')}>Add new date</ActionButton>
        </div>
      : <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {item.status === 'active'
            ? <ActionButton tone="markdown" onClick={() => onSheet('markdown')}>Mark down</ActionButton>
            : <ActionButton tone="markdown" onClick={() => onSheet('still_here')}>Still here</ActionButton>}
          <ActionButton tone="sold" onClick={() => onAction('cleared')}>Sold</ActionButton>
          <ActionButton tone="neutral" onClick={() => onAction('removed')}>Removed</ActionButton>
        </div>}
  </article>
}

const ACTION_TONES = { markdown: 'border-[#F5C08E] bg-[#FEF3E7] text-[#8A3A05]', sold: 'border-[#A9D9C2] bg-brand-100 text-brand-700', neutral: 'border-hairline bg-ground text-[#3B4A42]' } as const
function ActionButton({ tone, onClick, children }: { tone: keyof typeof ACTION_TONES; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-[10px] border px-2 text-sm font-bold ${ACTION_TONES[tone]}`}>{children}</button>
}

function MarkDownSheet({ item, stillHere, onClose, onConfirm }: { item: DashboardEntry; stillHere: boolean; onClose: () => void; onConfirm: (recheckAt: Date) => void }) {
  const [choice, setChoice] = useState<'1' | '2' | 'pick'>('1')
  const [picked, setPicked] = useState(inputDate(addDays(3)))
  const recheckAt = choice === 'pick' ? fromInputDate(picked) : fromInputDate(inputDate(addDays(Number(choice))))
  const option = (value: typeof choice, label: string) => <button type="button" aria-pressed={choice === value} onClick={() => setChoice(value)} className={`min-h-14 rounded-2xl border-2 text-[15px] font-bold ${choice === value ? 'border-brand-600 bg-brand-100 text-brand-700' : 'border-line bg-white'}`}>{label}</button>
  return <BottomSheet label={stillHere ? 'Still on the shelf' : 'Mark down'} eyebrow={stillHere ? 'Still on the shelf' : 'Mark down'} title={item.productName} subtitle={`${item.department} · ${item.quantity} units · expires ${shortDate(item.expirationDate)}`} onClose={onClose}>
    <p className="text-[15px] font-bold">{stillHere ? 'When should someone check it again?' : 'When should someone recheck it?'}</p>
    <div className="mt-2 grid grid-cols-3 gap-2">{option('1', 'Tomorrow')}{option('2', 'In 2 days')}{option('pick', 'Pick date')}</div>
    {choice === 'pick' && <label className="mt-3 block text-sm font-bold">Recheck date<input type="date" value={picked} min={inputDate(new Date())} onChange={e => setPicked(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-line px-3 text-base" /></label>}
    <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2.5"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={choice === 'pick' && !picked} onClick={() => onConfirm(recheckAt)}>{stillHere ? 'Save recheck' : 'Mark down'}</Button></div>
  </BottomSheet>
}

/**
 * New stock after Sold/Removed. A new date files under the item's own check while that check's
 * month is still current; for an older check it reuses this month's active check for the same
 * department, or points to starting one.
 */
function NewStockSheet({ item, onClose, onSave }: { item: DashboardEntry; onClose: () => void; onSave: (target: DashboardEntry, expirationDate: Date, quantity: number) => Promise<void> }) {
  const [expiry, setExpiry] = useState(''); const [quantity, setQuantity] = useState('1'); const [saving, setSaving] = useState(false)
  const sameMonth = item.codeDateCheckMonth === currentMonth()
  // undefined = still checking, null = no check this month yet.
  const [target, setTarget] = useState<DashboardEntry | null | undefined>(sameMonth ? item : undefined)
  useEffect(() => {
    if (sameMonth) return
    let cancelled = false
    findActiveCheckForMonth(currentMonth(), item.department)
      .then((check: CodeDateCheck | null) => { if (!cancelled) setTarget(check ? { ...item, codeDateCheckId: check.id, codeDateCheckName: check.name, codeDateCheckMonth: check.month } : null) })
      .catch(() => { if (!cancelled) setTarget(null) })
    return () => { cancelled = true }
  }, [item, sameMonth])

  async function save() { if (!target || !expiry) return; setSaving(true); await onSave(target, fromInputDate(expiry), Number(quantity) || 1); setSaving(false) }

  return <BottomSheet label="New stock" title={`New stock of ${item.productName}?`} subtitle="Add the new date now, or skip." onClose={onClose}>
    {target === undefined ? <p className="text-sm text-muted">Checking this month's checks…</p>
      : target === null ? <>
          <p className="text-sm">There's no {item.department} check for this month yet. Start one to add new dates.</p>
          <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2.5"><Button variant="secondary" onClick={onClose}>Skip</Button><Link to="/checks/new" className="flex min-h-12 items-center justify-center rounded-2xl bg-brand-600 font-bold text-white">Start a check</Link></div>
        </>
      : <>
          <div className="grid grid-cols-[2fr_1fr] gap-2.5">
            <label className="text-sm font-bold">Expiry date<input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-line px-3 text-base" /></label>
            <label className="text-sm font-bold">Quantity<input type="number" min="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-line px-3 text-center text-base font-bold" /></label>
          </div>
          <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2.5"><Button variant="secondary" onClick={onClose}>Skip</Button><Button disabled={!expiry || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save new date'}</Button></div>
        </>}
  </BottomSheet>
}
