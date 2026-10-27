import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { Resend } from 'resend'
import { gmailConfigured, gmailFromEnv, sendGmail } from './_lib/mailer.js'
import { adminApp, DEPARTMENTS, fetchReminderRows, getFirestore, getStoreEmails, STORE_EMAILS, storeDay, storeHour, type ReminderRow } from './_lib/reminder-data.js'

/**
 * Daily code-date emails — a separate email per department (Grocery, Dairy, Meat, Produce) that has
 * something due, all sent to the store's email address. Each is a plain, print-friendly checklist (no
 * links). Nothing is sent when nothing is due; the run is still logged as "nothing due" so the app can
 * tell a quiet day from a failed one. The store email is set in the app under More → Settings.
 *
 * Sending: through the hgmgr Gmail account when GMAIL_USER + GMAIL_APP_PASSWORD are set in Vercel
 * (no domain needed); otherwise through Resend (RESEND_API_KEY, needs a verified domain).
 *
 * Called three ways:
 *  - Vercel Cron (vercel.json), with `Authorization: Bearer $CRON_SECRET`, at 11:00, 12:00 and 13:00
 *    UTC. Whichever lands at 7 AM Toronto sends; the one at 8 AM is a retry that only sends if the
 *    7 AM run didn't get everything out (Vercel never retries a failed cron on its own); the rest do
 *    nothing.
 *  - From Settings with a signed-in store login: `?dryRun=1` returns a preview without sending.
 *  - From Settings with a signed-in store login, no dryRun: sends a test now (subject starts "[Test]").
 *
 * Every real attempt is written to settings/reminderLog so Settings and the Home page can show
 * whether today's email went out.
 */
const SEND_HOUR = 7
const RETRY_HOUR = 8
const HISTORY_DAYS = 14

type Result = { list: string; to: string[]; count: number; sent: boolean; reason?: string }
type RunStatus = 'sent' | 'partial' | 'failed' | 'nothing'
type RunLog = { day: string; at: Date; kind: 'daily' | 'retry' | 'test'; status: RunStatus; sentCount: number; results: Result[]; error?: string }

const statusOf = (results: Result[], error?: string): RunStatus => {
  if (error) return 'failed'
  const attempted = results.filter(r => r.sent || r.reason !== 'Nothing due today')
  if (!attempted.length) return results.length ? 'nothing' : 'failed'
  if (attempted.every(r => r.sent)) return 'sent'
  return attempted.some(r => r.sent) ? 'partial' : 'failed'
}

/** Records one attempt: the latest run, the latest test, and a short per-day history for the app. */
async function recordRun(logRef: FirebaseFirestore.DocumentReference, run: RunLog) {
  try {
    if (run.kind === 'test') { await logRef.set({ lastTest: run }, { merge: true }); return }
    const existing = (await logRef.get()).data() ?? {}
    const history = (Array.isArray(existing.history) ? existing.history : []).filter((h: { day?: string }) => h?.day !== run.day)
    const previous = (Array.isArray(existing.history) ? existing.history : []).find((h: { day?: string; status?: string }) => h?.day === run.day)
    // A retry that fails doesn't hide that 7 AM partly worked; a retry that works wins.
    const keep = previous && previous.status === 'partial' && run.status === 'failed' ? { ...previous, retryError: run.error ?? 'Retry failed' } : run
    const update: Record<string, unknown> = { lastRun: run, history: [keep, ...history].slice(0, HISTORY_DAYS) }
    if (run.status === 'sent' || run.status === 'nothing') { update.lastSentDay = run.day; update.lastSentAt = run.at; update.results = run.results }
    await logRef.set(update, { merge: true })
  } catch (error) {
    console.error('send-reminder: could not write the send log', error)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = String(req.headers.authorization ?? '')
  const cronSecret = process.env.CRON_SECRET
  const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
  if (!cronSecret && String(req.headers['user-agent'] ?? '').includes('vercel-cron')) {
    // Vercel only sends the secret when CRON_SECRET exists, so without it the 7 AM run can't be told apart from a stranger.
    console.error('send-reminder: CRON_SECRET is not set in Vercel, so the 7 AM run is refused. Add CRON_SECRET and redeploy.')
    try {
      const now = new Date()
      if (storeHour(now) === SEND_HOUR) await recordRun(getFirestore(adminApp()).collection('settings').doc('reminderLog'), { day: storeDay(now), at: now, kind: 'daily', status: 'failed', sentCount: 0, results: [], error: 'CRON_SECRET is not set in Vercel, so the 7 AM run was refused.' })
    } catch { /* logging is best-effort */ }
    return res.status(500).json({ error: 'CRON_SECRET is not set in Vercel.' })
  }
  const dryRun = req.query.dryRun === '1'
  const now = new Date()
  const today = storeDay(now)
  let logRef: FirebaseFirestore.DocumentReference | null = null
  let kind: RunLog['kind'] = isCron ? 'daily' : 'test'

  try {
    const app = adminApp()
    if (!isCron) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const user = token ? await getAuth(app).verifyIdToken(token).catch(() => null) : null
      if (!user || !STORE_EMAILS.includes(user.email ?? '')) return res.status(401).json({ error: 'Sign in with a store login first.' })
    }

    const database = getFirestore(app)
    logRef = database.collection('settings').doc('reminderLog')

    if (isCron) {
      const hour = storeHour(now)
      if (hour !== SEND_HOUR && hour !== RETRY_HOUR) return res.status(200).json({ skipped: `Not ${SEND_HOUR} or ${RETRY_HOUR} AM in Toronto (this is the other daylight-saving slot).` })
      const log = (await logRef.get()).data()
      if (log?.lastSentDay === today) return res.status(200).json({ skipped: 'Already sent today.' })
      if (hour === RETRY_HOUR) kind = 'retry'
    }

    const [rows, savedEmails] = await Promise.all([fetchReminderRows(database, undefined, undefined, now), getStoreEmails(database)])
    // A test send from Settings can go to whatever is typed in the Store email box, saved or not.
    const typed = !isCron && typeof req.query.to === 'string' ? req.query.to.split(',').map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) : []
    const storeEmails = typed.length ? typed : savedEmails
    const emails = DEPARTMENTS.map(department => {
      const departmentRows = rows.filter(r => r.area === department)
      return { list: department as string, to: storeEmails, rows: departmentRows, ...buildEmail(department, departmentRows, today) }
    })
    const nothingDue = !emails.some(e => e.rows.length)

    if (dryRun) {
      return res.status(200).json({ today, nothingDue, emails: emails.map(e => ({ list: e.list, to: e.to, count: e.rows.length, subject: e.subject, html: e.rows.length ? e.html : '' })) })
    }

    const useGmail = gmailConfigured()
    const key = process.env.RESEND_API_KEY
    if (!useGmail && !key) throw new Error('No email account set up. Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel.')
    const resend = useGmail ? null : new Resend(key)
    const from = process.env.RESEND_FROM_EMAIL || 'FreshTrack <onboarding@resend.dev>'
    const deliver = async (to: string[], subject: string, html: string, text: string): Promise<string | undefined> => {
      if (useGmail) {
        // One quick retry: a single dropped connection to Gmail shouldn't lose the email.
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { await sendGmail({ ...gmailFromEnv(), to, subject, html, text }); return undefined } catch (e) {
            if (attempt === 2 || (e instanceof Error && /rejected the login/.test(e.message))) return e instanceof Error ? e.message : 'Send failed'
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }
      const result = await resend!.emails.send({ from, to, subject, html, text })
      return result.error?.message
    }

    // Nothing due anywhere: no email. Only a test from Settings sends the short "nothing due" note, so you can see one arrive.
    const outgoing = nothingDue && !isCron ? [{ list: 'All departments', to: storeEmails, rows: [] as ReminderRow[], ...buildNothingDueEmail(today) }] : emails
    const results: Result[] = []
    for (const email of outgoing) {
      if (!email.to.length) { results.push({ list: email.list, to: [], count: email.rows.length, sent: false, reason: 'No store email set' }); continue }
      if (!email.rows.length && !(nothingDue && !isCron)) { results.push({ list: email.list, to: email.to, count: 0, sent: false, reason: 'Nothing due today' }); continue }
      const subject = isCron ? email.subject : `[Test] ${email.subject}`
      const error = await deliver(email.to, subject, email.html, email.text)
      results.push({ list: email.list, to: email.to, count: email.rows.length, sent: !error, reason: error })
      await new Promise(resolve => setTimeout(resolve, 600)) // stay under the sender's rate limit
    }

    const status = statusOf(results)
    await recordRun(logRef, { day: today, at: now, kind, status, sentCount: results.filter(r => r.sent).length, results })
    return res.status(200).json({ today, test: !isCron, status, results })
  } catch (error) {
    console.error('send-reminder failed', error)
    const message = error instanceof Error ? error.message : 'Could not send the daily emails.'
    if (logRef && !dryRun) await recordRun(logRef, { day: today, at: now, kind, status: 'failed', sentCount: 0, results: [], error: message })
    return res.status(500).json({ error: message })
  }
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!)
const niceDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function buildEmail(department: string, rows: ReminderRow[], today: string) {
  const rechecks = rows.filter(r => r.needsRecheck).sort((a, b) => b.quantity - a.quantity)
  const now = rows.filter(r => !r.needsRecheck && r.daysRemaining <= 0).sort((a, b) => a.daysRemaining - b.daysRemaining || b.quantity - a.quantity)
  const soon = rows.filter(r => !r.needsRecheck && r.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining || b.quantity - a.quantity)

  const parts = [rechecks.length && plural(rechecks.length, 'recheck'), now.length && `${now.length} to pull or mark down`, soon.length && `${soon.length} coming up`].filter(Boolean)
  const subject = `${department} code dates — ${niceDate(today)} — ${parts.join(', ') || 'nothing due'}`

  const when = (r: ReminderRow) => r.daysRemaining < 0 ? `${-r.daysRemaining} day${r.daysRemaining === -1 ? '' : 's'} overdue` : r.daysRemaining === 0 ? 'Today' : r.daysRemaining === 1 ? 'Tomorrow' : niceDate(r.expirationDate)
  // Black on white with ruled lines and an empty tick box per item, so it prints cleanly (even in
  // black and white) and reads well in a photo. No links — it's a checklist to work from.
  const cell = 'padding:9px 8px;border-bottom:1px solid #9AA59F;font-size:15px;vertical-align:top;color:#000'
  const head = 'padding:6px 8px;border-bottom:2px solid #000;font-size:12px;text-align:left;text-transform:uppercase;letter-spacing:.04em;color:#000'
  const box = '<div style="width:18px;height:18px;border:2px solid #000"></div>'
  const table = (items: ReminderRow[], dateHeader: string, dateCell: (r: ReminderRow) => string) => `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
    <tr><th style="${head};width:26px">Done</th><th style="${head}">Product / UPC</th><th style="${head}">${dateHeader}</th><th style="${head};text-align:right">Qty</th></tr>
    ${items.map(r => `<tr>
      <td style="${cell}">${box}</td>
      <td style="${cell}"><strong>${escape(r.product)}</strong><br><span style="font-family:'Courier New',monospace;font-size:14px">${escape(r.upc || '—')}</span></td>
      <td style="${cell};white-space:nowrap">${dateCell(r)}</td>
      <td style="${cell};text-align:right;font-size:18px;font-weight:bold">${r.quantity}</td>
    </tr>`).join('')}</table>`
  const section = (title: string, instruction: string, items: ReminderRow[], dateHeader: string, dateCell: (r: ReminderRow) => string) => !items.length ? '' : `
    <h2 style="margin:26px 0 2px;font-size:17px;color:#000">${title} (${items.length})</h2>
    <p style="margin:0 0 8px;font-size:14px;color:#333">${instruction}</p>
    ${table(items, dateHeader, dateCell)}`

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#000">
  <div style="max-width:680px;margin:0 auto;padding:20px">
    <h1 style="margin:0;font-size:24px">${escape(department)} code dates</h1>
    <p style="margin:4px 0 0;font-size:15px">${escape(niceDate(today))} · ${escape(parts.join(' · ') || 'Nothing due today.')}</p>
    <p style="margin:10px 0 0;font-size:14px;color:#333">Print it or take a picture, work through the list, and tick each box when done. Update the item in FreshTrack after.</p>
    ${section('1. Recheck markdowns', 'Check if these sold. Still there? Mark down again or remove.', rechecks, 'Recheck / expires', r => `${r.recheckAt ? `Recheck ${escape(niceDate(r.recheckAt))}` : 'Recheck now'}<br><span style="font-size:13px">expires ${escape(niceDate(r.expirationDate))}</span>`)}
    ${section('2. Pull or mark down today', 'Expired or expiring today — pull or mark down now.', now, 'Expires', r => `<strong>${escape(when(r))}</strong>`)}
    ${section('3. Coming up — next 5 days', 'Plan markdowns for these.', soon, 'Expires', r => escape(when(r)))}
    <p style="font-size:12px;color:#333;margin:24px 0 0">Sent by FreshTrack every morning at 7 AM.</p>
  </div></body></html>`

  const textSection = (title: string, items: ReminderRow[], dateText: (r: ReminderRow) => string) => !items.length ? '' :
    `\n${title} (${items.length})\n` + items.map(r => `[ ] ${r.product} | UPC ${r.upc || '-'} | ${dateText(r)} | Qty ${r.quantity}`).join('\n') + '\n'
  const text = `${department} code dates - ${niceDate(today)}\n${parts.join(', ') || 'Nothing due today.'}\n` +
    textSection('1. Recheck markdowns', rechecks, r => r.recheckAt ? `Recheck ${niceDate(r.recheckAt)}, expires ${niceDate(r.expirationDate)}` : `Recheck now, expires ${niceDate(r.expirationDate)}`) +
    textSection('2. Pull or mark down today', now, when) +
    textSection('3. Coming up - next 5 days', soon, when) +
    '\nTick each item when done and update it in FreshTrack after.\n'

  return { subject, html, text }
}

function buildNothingDueEmail(today: string) {
  const subject = `Code dates — ${niceDate(today)} — nothing due today`
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#000">
  <div style="max-width:680px;margin:0 auto;padding:20px">
    <h1 style="margin:0;font-size:24px">Code dates</h1>
    <p style="margin:4px 0 0;font-size:15px">${escape(niceDate(today))}</p>
    <p style="margin:14px 0 0;font-size:16px">Nothing is due today in Grocery, Dairy, Meat or Produce — no rechecks, nothing expiring today, and nothing in the next 5 days.</p>
    <p style="font-size:12px;color:#333;margin:24px 0 0">Sent by FreshTrack every morning at 7 AM.</p>
  </div></body></html>`
  const text = `Code dates - ${niceDate(today)}\n\nNothing is due today in Grocery, Dairy, Meat or Produce - no rechecks, nothing expiring today, and nothing in the next 5 days.\n`
  return { subject, html, text }
}
