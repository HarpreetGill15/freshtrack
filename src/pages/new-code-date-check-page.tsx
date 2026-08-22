import { ClipboardPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { createCodeDateCheck } from '../services/code-date-check-service'
import { DEPARTMENTS } from '../lib/departments'

const today = new Date().toISOString().slice(0, 10)
const currentMonth = today.slice(0, 7)

export function NewCodeDateCheckPage() {
  const navigate = useNavigate()
  const [name, setName] = useState(''); const [department, setDepartment] = useState(''); const [month, setMonth] = useState(currentMonth); const [checkDate, setCheckDate] = useState(today); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try { await createCodeDateCheck({ name: name.trim() || `${department} — Check`, department, month, checkDate }); navigate('/scan', { replace: true }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create Code Date Check.') }
    finally { setSaving(false) }
  }
  return <AppShell><div className="rounded-2xl bg-white p-6 shadow-card">
    <ClipboardPlus className="text-brand-600" size={30}/>
    <h2 className="mt-4 text-2xl font-bold">Start Code Date Check</h2>
    <p className="mt-1 text-sm text-slate-500">A few quick fields, then start scanning.</p>
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">Name<input className="mt-1 w-full rounded-xl border p-3 text-base" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. August Produce" autoFocus /></label>
      <label className="block text-sm font-medium">Department / Area<select className="mt-1 w-full rounded-xl border bg-white p-3 text-base" value={department} onChange={e => setDepartment(e.target.value)} required><option value="" disabled>Select</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Month<input className="mt-1 w-full rounded-xl border p-3 text-base" type="month" value={month} onChange={e => setMonth(e.target.value)} required /></label>
        <label className="block text-sm font-medium">Check date<input className="mt-1 w-full rounded-xl border p-3 text-base" type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} required /></label>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button className="w-full" disabled={saving || !department}>{saving ? 'Starting…' : 'Start scanning'}</Button>
    </form>
  </div></AppShell>
}
