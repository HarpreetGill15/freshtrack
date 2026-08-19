import { CheckCircle2, ClipboardList, Download, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { completeCodeDateCheck, listCodeDateChecks, setActiveCodeDateCheckId } from '../services/code-date-check-service'
import { getCodeDatesForCheck } from '../services/product-service'
import { downloadCheckExport } from '../lib/excel-export'
import type { CodeDateCheck } from '../types/domain'

export function ChecksListPage() {
  const navigate = useNavigate()
  const [checks, setChecks] = useState<CodeDateCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => { setLoading(true); try { setChecks(await listCodeDateChecks()); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Could not load checks.') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])

  function resume(check: CodeDateCheck) { setActiveCodeDateCheckId(check.id); navigate('/scan') }

  async function download(check: CodeDateCheck) {
    setBusyId(check.id); setError('')
    try { const entries = await getCodeDatesForCheck(check.id); downloadCheckExport(check, entries) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not export this check.') }
    finally { setBusyId(null) }
  }

  async function finish(check: CodeDateCheck) {
    setBusyId(check.id); setError('')
    try { await completeCodeDateCheck(check.id); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not finish this check.') }
    finally { setBusyId(null) }
  }

  return <AppShell>
    <h2 className="text-2xl font-bold">Code Date Checks</h2>
    <p className="mt-1 text-sm text-slate-500">Export or finish any check from here — works from a computer regardless of which phone did the scanning. Continue scanning to add more items to an unfinished check, even from a different device.</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="mt-6 space-y-3">
      {loading ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Loading…</p>
        : !checks.length ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center"><ClipboardList className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">No Code Date Checks yet</p></div>
        : checks.map(check => <article key={check.id} className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-bold">{check.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{check.department}{check.section ? ` / ${check.section}` : ''} · {check.month} · {check.checkDate}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${check.status === 'completed' ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700'}`}>{check.status === 'completed' ? 'Completed' : 'Active'}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {check.status !== 'completed' && <Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" onClick={() => resume(check)}><ScanLine size={15} className="mr-1"/>Continue scanning</Button>}
            <Button variant="secondary" className="min-h-9 flex-1 px-2 text-xs" disabled={busyId === check.id} onClick={() => void download(check)}><Download size={15} className="mr-1"/>Excel</Button>
            {check.status !== 'completed' && <Button className="min-h-9 flex-1 px-2 text-xs" disabled={busyId === check.id} onClick={() => void finish(check)}><CheckCircle2 size={15} className="mr-1"/>Finish</Button>}
          </div>
        </article>)}
    </section>
  </AppShell>
}
