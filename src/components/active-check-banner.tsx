import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getActiveCodeDateCheck } from '../services/code-date-check-service'
import type { CodeDateCheck } from '../types/domain'

export function ActiveCheckBanner() {
  const [check, setCheck] = useState<CodeDateCheck | null>(null)
  useEffect(() => { void getActiveCodeDateCheck().then(setCheck).catch(() => setCheck(null)) }, [])
  if (!check) return null
  return <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
    <span><strong>{check.name}</strong> · {check.department} · {check.month}</span>
    <Link to="/checks/finish" className="shrink-0 text-xs font-bold underline">Finish check</Link>
  </div>
}
