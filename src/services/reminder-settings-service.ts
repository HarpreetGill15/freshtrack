import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { app, db, firebaseNotConfiguredMessage } from '../lib/firebase'

const settingsRef = () => { if (!db) throw new Error(firebaseNotConfiguredMessage); return doc(db, 'settings', 'reminders') }

/** The store email address(es) every department's daily email goes to. Store logins only (firestore.rules). */
export async function getStoreEmails(): Promise<string[]> {
  const data = (await getDoc(settingsRef())).data()
  return Array.isArray(data?.storeEmails) ? data.storeEmails.map(String) : []
}

export async function saveStoreEmails(storeEmails: string[]) {
  await setDoc(settingsRef(), { storeEmails, updatedAt: serverTimestamp() }, { merge: true })
}

/** Splits what was typed (commas, spaces, new lines) into addresses; returns the ones that don't look like emails too. */
export function parseEmails(text: string) {
  const parts = text.split(/[\s,;]+/).map(part => part.trim()).filter(Boolean)
  const valid = parts.filter(part => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part))
  return { valid: [...new Set(valid.map(v => v.toLowerCase()))], invalid: parts.filter(part => !valid.includes(part)) }
}

export type EmailPreview = { list: string; to: string[]; count: number; subject: string; html: string }
export type SendResult = { list: string; to: string[]; count: number; sent: boolean; reason?: string }

/** Calls the daily-email function as the signed-in store login: a preview (nothing sent) or a test send right now. */
async function callSendReminder(dryRun: boolean, to: string[] = []) {
  const user = app ? getAuth(app).currentUser : null
  if (!user) throw new Error('Sign in first.')
  const query = dryRun ? '?dryRun=1' : to.length ? `?to=${encodeURIComponent(to.join(','))}` : ''
  const response = await fetch(`/api/send-reminder${query}`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
  const raw = await response.text()
  let data: { error?: string; emails?: EmailPreview[]; results?: SendResult[] } = {}
  try { data = JSON.parse(raw) } catch { /* not JSON — e.g. the server crashed before it could answer */ }
  // Show the real reason (status code + the start of the server's reply) so problems can be fixed quickly.
  if (!response.ok) throw new Error(data.error ?? `The email service failed (${response.status}): ${raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'no reply'}`)
  return data
}
export const previewEmails = async () => (await callSendReminder(true)).emails ?? []
/** Sends today's emails now, to `to` if given (what's typed in the Store email box) or else the saved store email. */
export const sendTestEmails = async (to: string[] = []) => (await callSendReminder(false, to)).results ?? []

export type EmailRunStatus = 'sent' | 'partial' | 'failed' | 'nothing'
export type EmailRun = { day: string; at: Date | null; kind: 'daily' | 'retry' | 'test'; status: EmailRunStatus; sentCount: number; results: SendResult[]; error?: string; retryError?: string }
export type EmailLog = { history: EmailRun[]; lastTest: EmailRun | null }

const toRun = (raw: unknown): EmailRun | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const at = r.at as { toDate?: () => Date } | undefined
  return {
    day: String(r.day ?? ''),
    at: at?.toDate ? at.toDate() : null,
    kind: (r.kind as EmailRun['kind']) ?? 'daily',
    status: (r.status as EmailRunStatus) ?? 'failed',
    sentCount: Number(r.sentCount ?? 0),
    results: Array.isArray(r.results) ? r.results as SendResult[] : [],
    error: r.error ? String(r.error) : undefined,
    retryError: r.retryError ? String(r.retryError) : undefined,
  }
}

/** What the server recorded about the daily emails (settings/reminderLog). Store logins only. */
export async function getEmailLog(): Promise<EmailLog> {
  if (!db) throw new Error(firebaseNotConfiguredMessage)
  const data = (await getDoc(doc(db, 'settings', 'reminderLog'))).data() ?? {}
  const history = (Array.isArray(data.history) ? data.history : []).map(toRun).filter((r): r is EmailRun => r != null)
  // Before this log existed only lastSentDay was kept — show it so the history isn't blank on day one.
  if (!history.length && typeof data.lastSentDay === 'string') {
    const at = data.lastSentAt as { toDate?: () => Date } | undefined
    const results = Array.isArray(data.results) ? data.results as SendResult[] : []
    history.push({ day: data.lastSentDay, at: at?.toDate ? at.toDate() : null, kind: 'daily', status: 'sent', sentCount: results.filter(r => r.sent).length, results })
  }
  return { history, lastTest: toRun(data.lastTest) }
}

/** Today's date and hour in the store's time zone (the emails run on Toronto time). */
export function storeNow(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23' }).format(date))
  return { day, hour }
}
