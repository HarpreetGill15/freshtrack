import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { getDashboardEntries, getResolvedSince } from '../services/product-service'
import { addDays, daysUntil, shortDate } from '../lib/dates'
import type { DashboardEntry } from '../types/domain'

// Chart colours (checked for colour-blind separation): sold green / removed orange, with labels and
// a legend so colour is never the only cue. Coming-up bars are one blue; today is drawn in ink.
const SOLD = '#15936A', REMOVED = '#D06A10', UPCOMING = '#1D5FB5', TODAY = '#13201A'
const WEEKS = 8

function startOfWeek(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d } // Monday

export function DashboardPage() {
  const [open, setOpen] = useState<DashboardEntry[]>([])
  const [resolved, setResolved] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const [department, setDepartment] = useState('all')
  const firstWeek = useMemo(() => addDays(-7 * (WEEKS - 1), startOfWeek(new Date())), [])

  useEffect(() => {
    Promise.all([getDashboardEntries(), getResolvedSince(firstWeek)])
      .then(([openItems, resolvedItems]) => { setOpen(openItems); setResolved(resolvedItems) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load the dashboard.'))
      .finally(() => setLoading(false))
  }, [firstWeek])

  const departments = useMemo(() => [...new Set([...open, ...resolved].map(i => i.department).filter(d => d && d !== 'Unassigned'))].sort(), [open, resolved])

  const comingUp = useMemo(() => {
    const active = open.filter(i => i.status === 'active' && (department === 'all' || i.department === department))
    const days = Array.from({ length: 14 }, (_, offset) => ({ date: addDays(offset), units: 0 }))
    let overdue = 0
    for (const item of active) {
      const d = daysUntil(item.expirationDate)
      if (d < 0) overdue += item.quantity
      else if (d < 14) days[d].units += item.quantity
    }
    const biggest = active.filter(i => { const d = daysUntil(i.expirationDate); return d >= 0 && d < 14 }).sort((a, b) => b.quantity - a.quantity).slice(0, 3)
    return { days, overdue, biggest }
  }, [open, department])

  const weekly = useMemo(() => {
    const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: addDays(7 * i, firstWeek), sold: 0, removed: 0 }))
    for (const item of resolved.filter(i => department === 'all' || i.department === department)) {
      if (!item.resolvedAt) continue
      const index = Math.floor((startOfWeek(item.resolvedAt).getTime() - firstWeek.getTime()) / (7 * 86400000))
      if (index < 0 || index >= WEEKS) continue
      if (item.status === 'cleared') weeks[index].sold += item.quantity
      else weeks[index].removed += item.quantity
    }
    const share = (list: typeof weeks) => { const sold = list.reduce((s, w) => s + w.sold, 0), total = list.reduce((s, w) => s + w.sold + w.removed, 0); return total ? Math.round((sold / total) * 100) : null }
    return { weeks, recent: share(weeks.slice(-4)), before: share(weeks.slice(0, 4)) }
  }, [resolved, firstWeek, department])

  const removedByDept = useMemo(() => {
    const since = addDays(-28)
    const totals = new Map<string, number>()
    for (const item of resolved) if (item.status === 'removed' && item.resolvedAt && item.resolvedAt >= since) totals.set(item.department, (totals.get(item.department) ?? 0) + item.quantity)
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [resolved])

  return <AppShell>
    <h1 className="text-2xl font-extrabold">Dashboard</h1>
    <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Department">
      {['all', ...departments].map(d => <button key={d} type="button" aria-pressed={department === d} onClick={() => setDepartment(d)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${department === d ? 'bg-ink text-white' : 'border border-line bg-white'}`}>{d === 'all' ? 'All depts' : d}</button>)}
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-overdue">{error}</p>}
    {loading ? <p className="mt-4 rounded-2xl bg-white p-8 text-center text-muted">Loading…</p> : <div className="mt-3 space-y-3.5">

      <ChartCard title="Coming up" subtitle="Units expiring each day, next 14 days" table={<Table head={['Day', 'Units']} rows={comingUp.days.map(d => [shortDate(d.date), String(d.units)])} />}>
        {comingUp.overdue > 0 && <Link to="/todo?tab=today" className="mt-2 inline-block text-sm font-bold text-overdue">{comingUp.overdue} unit{comingUp.overdue === 1 ? '' : 's'} already overdue →</Link>}
        <BarChart
          bars={comingUp.days.map((d, i) => ({ key: String(i), label: i === 0 ? 'Today' : shortDate(d.date), segments: [{ value: d.units, color: i === 0 ? TODAY : UPCOMING, name: 'units' }] }))}
          axis={['Today', shortDate(addDays(7)), shortDate(addDays(13))]}
          gap="gap-1"
        />
        {comingUp.biggest.length > 0 && <div className="mt-3.5 border-t border-hairline pt-2.5">
          <p className="mb-1 text-[13px] font-bold uppercase tracking-wider text-muted">Biggest coming up</p>
          {comingUp.biggest.map(item => <Link key={item.id} to={`/products/${item.productId}`} className="flex min-h-12 items-center gap-2.5 border-b border-hairline last:border-b-0">
            <span className="min-w-0 flex-1 truncate font-bold">{item.productName}</span>
            <span className="text-sm text-muted">{shortDate(item.expirationDate)}</span>
            <span className="min-w-10 text-right font-display text-lg font-extrabold">{item.quantity}</span>
          </Link>)}
        </div>}
      </ChartCard>

      <ChartCard title="Sold vs removed" subtitle="Marked-down units per week, last 8 weeks" table={<Table head={['Week of', 'Sold', 'Removed']} rows={weekly.weeks.map(w => [shortDate(w.start), String(w.sold), String(w.removed)])} />}>
        {weekly.recent != null && <p className="mt-2.5 flex items-baseline gap-2"><span className="font-display text-[32px] font-extrabold">{weekly.recent}%</span><span className="text-sm text-muted">sold in the last 4 weeks{weekly.before != null ? `, ${weekly.recent >= weekly.before ? 'up' : 'down'} from ${weekly.before}%` : ''}</span></p>}
        <div className="mt-2 flex gap-4 text-[13px] font-bold"><Legend color={SOLD} label="Sold" /><Legend color={REMOVED} label="Removed" /></div>
        <BarChart
          bars={weekly.weeks.map((w, i) => ({ key: String(i), label: `Week of ${shortDate(w.start)}`, segments: [{ value: w.sold, color: SOLD, name: 'sold' }, { value: w.removed, color: REMOVED, name: 'removed' }] }))}
          axis={[shortDate(weekly.weeks[0].start), 'This week']}
          gap="gap-2.5"
        />
      </ChartCard>

      <ChartCard title="Removed by department" subtitle="Units thrown out in the last 4 weeks" table={<Table head={['Department', 'Units removed']} rows={removedByDept.map(([d, u]) => [d, String(u)])} />}>
        {removedByDept.length ? <div className="mt-3 space-y-2.5">{removedByDept.map(([dept, units]) => <div key={dept} className="grid grid-cols-[84px_minmax(0,1fr)_40px] items-center gap-2.5" role="img" aria-label={`${dept}: ${units} units removed`}>
          <span className="truncate text-sm font-bold">{dept}</span>
          <span className="h-4 rounded bg-ground"><span className="block h-4 rounded-r" style={{ width: `${(units / removedByDept[0][1]) * 100}%`, background: REMOVED }} /></span>
          <span className="text-right text-sm font-bold">{units}</span>
        </div>)}</div> : <p className="mt-3 text-sm text-muted">Nothing removed in the last 4 weeks.</p>}
      </ChartCard>
    </div>}
  </AppShell>
}

function ChartCard({ title, subtitle, table, children }: { title: string; subtitle: string; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return <section className="rounded-[18px] bg-white p-4">
    <div className="flex items-start justify-between gap-2">
      <div><h2 className="text-[17px] font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted">{subtitle}</p></div>
      <button type="button" onClick={() => setAsTable(v => !v)} className="min-h-11 shrink-0 px-1 text-sm font-bold text-brand-600">{asTable ? 'Chart' : 'Table'}</button>
    </div>
    {asTable ? <div className="mt-3">{table}</div> : children}
  </section>
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: color }} aria-hidden="true" />{label}</span>
}

type Bar = { key: string; label: string; segments: { value: number; color: string; name: string }[] }

/**
 * Column chart drawn with plain elements. Tap (or hover) a column to read its exact numbers in the
 * line above the chart; the tallest column and the latest one are labelled directly.
 */
function BarChart({ bars, axis, gap }: { bars: Bar[]; axis: string[]; gap: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const totals = bars.map(b => b.segments.reduce((sum, s) => sum + s.value, 0))
  const max = Math.max(1, ...totals)
  const maxIndex = totals.indexOf(Math.max(...totals))
  const active = bars.find(b => b.key === selected)
  const describe = (bar: Bar) => `${bar.label}: ${bar.segments.map(s => `${s.value} ${s.name}`).join(', ')}`
  return <div className="mt-3">
    <p className="min-h-5 text-[13px] font-bold" aria-live="polite">{active ? describe(active) : <span className="font-normal text-muted">Tap a bar for numbers</span>}</p>
    <div className={`mt-1 flex h-[150px] items-end border-b border-line ${gap}`}>
      {bars.map((bar, i) => {
        const total = totals[i]
        const showLabel = total > 0 && (i === maxIndex || i === bars.length - 1)
        return <button key={bar.key} type="button" aria-label={describe(bar)} aria-pressed={selected === bar.key}
          onClick={() => setSelected(s => s === bar.key ? null : bar.key)} onMouseEnter={() => setSelected(bar.key)}
          className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end ${selected && selected !== bar.key ? 'opacity-50' : ''}`}>
          {showLabel && <span className="mb-0.5 text-xs font-bold">{total}</span>}
          <span className="flex w-full flex-col-reverse gap-[2px]" style={{ height: `${(total / max) * 120}px` }}>
            {bar.segments.filter(s => s.value > 0).map((s, si, list) => <span key={s.name} className={si === list.length - 1 ? 'rounded-t' : ''} style={{ flexGrow: s.value, background: s.color }} />)}
          </span>
        </button>
      })}
    </div>
    <div className="mt-1.5 flex justify-between text-xs text-muted">{axis.map(label => <span key={label}>{label}</span>)}</div>
  </div>
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className="max-h-72 overflow-auto rounded-xl border border-hairline"><table className="w-full text-sm">
    <thead className="sticky top-0 bg-ground"><tr>{head.map((h, i) => <th key={h} className={`px-3 py-2 font-bold ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row[0]} className="border-t border-hairline">{row.map((cell, i) => <td key={i} className={`px-3 py-2 ${i ? 'text-right font-bold' : ''}`}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}
