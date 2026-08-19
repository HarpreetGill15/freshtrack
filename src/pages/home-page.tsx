import { ClipboardList, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { getActiveCodeDateCheck } from '../services/code-date-check-service'
import type { CodeDateCheck } from '../types/domain'

export function HomePage() {
  const navigate = useNavigate()
  const [activeCheck, setActiveCheck] = useState<CodeDateCheck | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { void getActiveCodeDateCheck().then(setActiveCheck).catch(() => setActiveCheck(null)).finally(() => setLoading(false)) }, [])

  return (
    <main className="grid min-h-screen place-items-center bg-brand-50 p-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-card">
        <div className="mb-7">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-xl font-black text-white">F</div>
          <h1 className="text-2xl font-bold text-slate-900">FreshTrack</h1>
          <p className="mt-1 text-sm text-slate-500">Grocery code-date management. No sign-in required to run a check.</p>
        </div>

        {!loading && activeCheck && (
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
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

        <p className="mt-6 text-center text-xs text-slate-400">
          Staff dashboard, product import, and settings live under{' '}
          <Link to="/dashboard" className="font-semibold text-brand-600">Dashboard</Link>.
        </p>
      </div>
    </main>
  )
}
