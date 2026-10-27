import { CheckCircle2, Clock, Mail, TriangleAlert, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEmailLog, storeNow, type EmailLog, type EmailRun } from '../services/reminder-settings-service'

type Tone = 'good' | 'warn' | 'bad' | 'wait'
export type TodayStatus = { tone: Tone; title: string; detail: string }

const time = (d: Date | null) => d ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }) : ''
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const failedLists = (run: EmailRun) => run.results.filter(r => !r.sent && r.reason !== 'Nothing due today')

/** Turns the send log into one plain answer for today: sent, partly sent, failed, or not yet. */
export function todayStatus(log: EmailLog, now = new Date()): TodayStatus {
  const { day, hour } = storeNow(now)
  const run = log.history.find(h => h.day === day)
  if (run?.status === 'sent') {
    const nothingDue = run.results.length === 1 && run.results[0].list === 'All departments'
    return { tone: 'good', title: `Sent at ${time(run.at)}${run.kind === 'retry' ? ' (on the 8 AM retry)' : ''}`, detail: nothingDue ? 'Nothing was due — a "nothing due today" email went out.' : `${run.sentCount} department email${run.sentCount === 1 ? '' : 's'} sent: ${run.results.filter(r => r.sent).map(r => r.list).join(', ')}.` }
  }
  if (run?.status === 'partial') {
    const failed = failedLists(run)
    return { tone: 'warn', title: 'Only some emails went out', detail: `${failed.map(r => `${r.list}: ${r.reason}`).join(' · ')}${hour < 9 && run.kind === 'daily' ? ' — it will retry at 8 AM.' : ''}` }
  }
  if (run?.status === 'failed') {
    const reason = run.error || failedLists(run).map(r => `${r.list}: ${r.reason}`).join(' · ') || 'Unknown error'
    return { tone: 'bad', title: 'Not sent', detail: `${reason}${hour < 8 && run.kind === 'daily' ? ' — it will retry at 8 AM.' : ''}` }
  }
  if (hour < 7) return { tone: 'wait', title: 'Sends at 7 AM', detail: 'Today\'s email hasn\'t gone out yet.' }
  if (hour < 9) return { tone: 'wait', title: 'Sending soon', detail: 'The 7 AM run can land any time before 8. If it misses, it retries at 8 AM.' }
  return { tone: 'bad', title: 'Not sent', detail: 'The 7 AM run never happened today. Check the Logs for the freshtrack project in Vercel.' }
}

const toneStyle: Record<Tone, string> = { good: 'text-brand-700', warn: 'text-soon', bad: 'text-overdue', wait: 'text-muted' }
function ToneIcon({ tone, size = 20 }: { tone: Tone; size?: number }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? TriangleAlert : tone === 'bad' ? XCircle : Clock
  return <Icon size={size} className={`shrink-0 ${toneStyle[tone]}`} aria-hidden="true" />
}

export function useEmailLog() {
  const [log, setLog] = useState<EmailLog | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => { getEmailLog().then(setLog).catch(e => setError(e instanceof Error ? e.message : 'Could not load the email status.')) }, [version])
  return { log, error, reload: () => setVersion(v => v + 1) }
}

/** Settings: today's answer plus the last week, day by day. */
export function EmailStatusPanel({ log, error }: { log: EmailLog | null; error: string }) {
  if (error) return <p className="mt-3 text-sm text-muted">{error}</p>
  if (!log) return <p className="mt-3 text-sm text-muted">Loading email status…</p>
  const status = todayStatus(log)
  const { day } = storeNow()
  const past = log.history.filter(h => h.day !== day).slice(0, 7)
  return <section className="mt-4 rounded-xl border border-hairline p-3" aria-label="Daily email status">
    <p className="text-[13px] font-bold uppercase tracking-wider text-muted">Today's email</p>
    <div className="mt-1.5 flex gap-2.5"><ToneIcon tone={status.tone} /><div><p className={`font-bold ${toneStyle[status.tone]}`}>{status.title}</p><p className="text-sm text-muted">{status.detail}</p></div></div>
    {past.length > 0 && <>
      <p className="mt-4 text-[13px] font-bold uppercase tracking-wider text-muted">Earlier</p>
      <ul className="mt-1 divide-y divide-hairline">{past.map(run => {
        const tone: Tone = run.status === 'sent' ? 'good' : run.status === 'partial' ? 'warn' : 'bad'
        return <li key={run.day} className="flex items-start gap-2.5 py-2 text-sm">
          <ToneIcon tone={tone} size={17} />
          <span className="w-24 shrink-0 font-bold">{dayLabel(run.day)}</span>
          <span className="min-w-0 flex-1 text-muted">{run.status === 'sent' ? `Sent ${time(run.at)}${run.kind === 'retry' ? ' (retry)' : ''}` : run.status === 'partial' ? `Partly sent — ${failedLists(run).map(r => r.list).join(', ')} failed` : `Not sent — ${run.error || failedLists(run).map(r => r.reason).join(', ') || 'unknown error'}`}</span>
        </li>
      })}</ul>
    </>}
    {log.lastTest && <p className="mt-3 text-xs text-muted">Last test: {dayLabel(log.lastTest.day)} {time(log.lastTest.at)} — {log.lastTest.status === 'sent' ? 'sent' : log.lastTest.status === 'partial' ? 'partly sent' : `failed${log.lastTest.error ? ` (${log.lastTest.error})` : ''}`}.</p>}
    <p className="mt-3 text-xs text-muted">"Sent" means Gmail accepted it. If the store inbox doesn't have it, check the Junk folder there.</p>
  </section>
}

/** Home page: one tappable line for the signed-in store logins. Hidden when the log can't be read. */
export function EmailStatusLine() {
  const { log } = useEmailLog()
  if (!log) return null
  const status = todayStatus(log)
  return <Link to="/settings" className="mt-5 flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 py-3">
    <Mail size={20} className="shrink-0 text-muted" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block text-sm text-muted">Today's code date email</span><span className={`block font-bold ${toneStyle[status.tone]}`}>{status.title}</span></span>
    <ToneIcon tone={status.tone} />
  </Link>
}
