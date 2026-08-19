import { CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { completeCodeDateCheck, getActiveCodeDateCheck } from '../services/code-date-check-service'
import { getCodeDatesForCheck } from '../services/product-service'
import { downloadCheckExport } from '../lib/excel-export'
import type { CodeDateCheck, DashboardEntry } from '../types/domain'

export function CheckFinishPage() {
  const navigate = useNavigate()
  const [check, setCheck] = useState<CodeDateCheck | null>(null)
  const [entries, setEntries] = useState<DashboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const activeCheck = await getActiveCodeDateCheck()
      setCheck(activeCheck)
      if (activeCheck) setEntries(await getCodeDatesForCheck(activeCheck.id))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the check summary.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <AppShell><p className="text-sm text-slate-500">Loading…</p></AppShell>
  if (!check) return <Navigate to="/" replace />

  const productCount = new Set(entries.map(e => e.productId)).size

  async function complete() {
    if (!check) return
    setCompleting(true); setError('')
    try { await completeCodeDateCheck(check.id); navigate('/', { replace: true }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not complete the check.') }
    finally { setCompleting(false) }
  }

  return <AppShell>
    <h2 className="text-2xl font-bold">Finish Code Date Check</h2>
    <p className="mt-1 text-sm text-slate-500">{check.name} · {check.department}{check.section ? ` / ${check.section}` : ''} · {check.month}</p>

    <section className="mt-6 grid grid-cols-2 gap-3">
      <Stat label="Products scanned" value={productCount} />
      <Stat label="Code-date records" value={entries.length} />
    </section>
    <p className="mt-2 text-xs text-slate-400">Reviewing and updating item status (marked down, cleared, removed) happens on the Dashboard after the check — this screen is just for wrapping up scanning.</p>

    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section className="mt-6 rounded-2xl bg-white p-5 shadow-card">
      <div className="flex items-center gap-3"><FileSpreadsheet className="text-brand-600" size={22}/><div><p className="font-semibold">Export Excel</p><p className="text-xs text-slate-500">All records for this check, sorted by nearest expiry.</p></div></div>
      <Button variant="secondary" className="mt-4 w-full" disabled={!entries.length} onClick={() => downloadCheckExport(check, entries)}><Download size={17} className="mr-2"/>Download .xlsx</Button>
      <p className="mt-2 text-center text-xs text-slate-400">On a computer? Go to Dashboard → Checks to export from there instead.</p>
    </section>

    <div className="mt-6 flex gap-3">
      <Link to="/scan" className="flex-1"><Button variant="secondary" className="w-full">Continue scanning</Button></Link>
      <Button className="flex-1" disabled={completing} onClick={() => void complete()}><CheckCircle2 size={17} className="mr-2"/>{completing ? 'Finishing…' : 'Finish check'}</Button>
    </div>
  </AppShell>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white p-4 shadow-card"><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>
}
