import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { Resend } from 'resend'
import { adminApp, DEPARTMENTS, fetchReminderRows, getFirestore, getRecipients, STORE_EMAILS, storeDay, storeHour, type ReminderRow } from './_lib/reminder-data'

/**
 * Daily code-date emails — one per department (Grocery, Dairy, Meat, Produce) to that department's
 * people, plus an optional "All departments" email with everything. A department with nothing due
 * gets no email that day. Recipients are set in the app under More → Settings.
 *
 * Called three ways:
 *  - Vercel Cron (vercel.json), with `Authorization: Bearer $CRON_SECRET`. It's scheduled at both 11:00
 *    and 12:00 UTC so one of them lands at 7 AM Toronto in summer and in winter; the other does
 *    nothing. A log in Firestore stops a second send on the same day.
 *  - From Settings with a signed-in store login: `?dryRun=1` returns a preview without sending.
 *  - From Settings with a signed-in store login, no dryRun: sends a test now (subject starts "[Test]").
 */
const SEND_HOUR = 7

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = String(req.headers.authorization ?? '')
  const cronSecret = process.env.CRON_SECRET
  const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
  const dryRun = req.query.dryRun === '1'

  try {
    const app = adminApp()
    if (!isCron) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const user = token ? await getAuth(app).verifyIdToken(token).catch(() => null) : null
      if (!user || !STORE_EMAILS.includes(user.email ?? '')) return res.status(401).json({ error: 'Sign in with a store login first.' })
    }

    const database = getFirestore(app)
    const now = new Date()
    const today = storeDay(now)
    const logRef = database.collection('settings').doc('reminderLog')

    if (isCron) {
      if (storeHour(now) !== SEND_HOUR) return res.status(200).json({ skipped: `Not ${SEND_HOUR} AM in Toronto yet (this is the other daylight-saving slot).` })
      if ((await logRef.get()).data()?.lastSentDay === today) return res.status(200).json({ skipped: 'Already sent today.' })
    }

    const [rows, recipients] = await Promise.all([fetchReminderRows(database, undefined, undefined, now), getRecipients(database)])
    const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')

    const emails = [
      ...DEPARTMENTS.map(department => ({ list: department, to: recipients[department], rows: rows.filter(r => r.area === department), showDepartment: false })),
      { list: 'All departments', to: recipients.all, rows, showDepartment: true },
    ].map(email => ({ ...email, ...buildEmail(email.list, email.rows, email.showDepartment, appUrl, today) }))

    if (dryRun) {
      return res.status(200).json({ today, emails: emails.map(e => ({ list: e.list, to: e.to, count: e.rows.length, subject: e.subject, html: e.rows.length ? e.html : '' })) })
    }

    const key = process.env.RESEND_API_KEY
    if (!key) return res.status(500).json({ error: 'RESEND_API_KEY is not set in Vercel.' })
    const resend = new Resend(key)
    // Resend's shared sender works without setup but only delivers to the Resend account's own email
    // address — set RESEND_FROM_EMAIL (e.g. "FreshTrack <codedates@yourdomain.ca>") after verifying a domain.
    const from = process.env.RESEND_FROM_EMAIL || 'FreshTrack <onboarding@resend.dev>'

    const results: { list: string; to: string[]; count: number; sent: boolean; reason?: string }[] = []
    for (const email of emails) {
      if (!email.to.length) { results.push({ list: email.list, to: [], count: email.rows.length, sent: false, reason: 'No email addresses set' }); continue }
      if (!email.rows.length) { results.push({ list: email.list, to: email.to, count: 0, sent: false, reason: 'Nothing due today' }); continue }
      const result = await resend.emails.send({ from, to: email.to, subject: isCron ? email.subject : `[Test] ${email.subject}`, html: email.html })
      results.push({ list: email.list, to: email.to, count: email.rows.length, sent: !result.error, reason: result.error?.message })
      await new Promise(resolve => setTimeout(resolve, 600)) // stay under Resend's free-plan rate limit
    }

    if (isCron) await logRef.set({ lastSentDay: today, lastSentAt: now, results }, { merge: true })
    return res.status(200).json({ today, test: !isCron, results })
  } catch (error) {
    console.error('send-reminder failed', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not send the daily emails.' })
  }
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!)
const niceDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function buildEmail(list: string, rows: ReminderRow[], showDepartment: boolean, appUrl: string, today: string) {
  const rechecks = rows.filter(r => r.needsRecheck).sort((a, b) => b.quantity - a.quantity)
  const now = rows.filter(r => !r.needsRecheck && r.daysRemaining <= 0).sort((a, b) => a.daysRemaining - b.daysRemaining || b.quantity - a.quantity)
  const soon = rows.filter(r => !r.needsRecheck && r.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining || b.quantity - a.quantity)

  const parts = [rechecks.length && plural(rechecks.length, 'recheck'), now.length && `${now.length} to pull or mark down`, soon.length && `${soon.length} coming up`].filter(Boolean)
  const subject = `FreshTrack · ${list} — ${parts.join(', ') || 'nothing due'}`

  const when = (r: ReminderRow) => r.daysRemaining < 0 ? `${-r.daysRemaining}d overdue` : r.daysRemaining === 0 ? 'Today' : r.daysRemaining === 1 ? 'Tomorrow' : niceDate(r.expirationDate)
  const cell = 'padding:8px 6px;border-bottom:1px solid #DCE3DF;font-size:14px;vertical-align:top'
  const table = (items: ReminderRow[], extra: (r: ReminderRow) => string) => `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${items.map(r => `<tr>
      <td style="${cell}"><strong>${escape(r.product)}</strong><br><span style="color:#4A5A52;font-size:12px;font-family:monospace">${escape(r.upc || '—')}</span>${showDepartment ? `<span style="color:#4A5A52;font-size:12px"> · ${escape(r.area || 'Unassigned')}</span>` : ''}</td>
      <td style="${cell};white-space:nowrap">${extra(r)}</td>
      <td style="${cell};text-align:right;white-space:nowrap"><strong style="font-size:16px">${r.quantity}</strong> <span style="color:#4A5A52;font-size:12px">qty</span></td>
    </tr>`).join('')}</table>`
  const section = (title: string, color: string, items: ReminderRow[], extra: (r: ReminderRow) => string, tab: string) => !items.length ? '' : `
    <h2 style="margin:24px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${color}">${title} (${items.length})</h2>
    ${table(items, extra)}
    ${appUrl ? `<p style="margin:8px 0 0"><a href="${escape(`${appUrl}/todo?tab=${tab}`)}" style="color:#0D6B4F;font-weight:bold;font-size:14px">Open in FreshTrack →</a></p>` : ''}`

  const html = `<!doctype html><html><body style="margin:0;background:#F4F6F3;font-family:Arial,Helvetica,sans-serif;color:#13201A">
  <div style="max-width:640px;margin:0 auto;padding:20px">
    <div style="background:#ffffff;border-radius:16px;padding:20px">
      <p style="margin:0;font-size:13px;color:#4A5A52">FreshTrack · ${escape(niceDate(today))}</p>
      <h1 style="margin:4px 0 0;font-size:22px">${escape(list)} code dates</h1>
      <p style="margin:6px 0 0;font-size:15px;color:#4A5A52">${escape(parts.join(' · ') || 'Nothing due today.')}</p>
      ${section('Recheck markdowns', '#1D5FB5', rechecks, r => r.recheckAt ? `Recheck ${escape(niceDate(r.recheckAt))}<br><span style="color:#4A5A52;font-size:12px">expires ${escape(niceDate(r.expirationDate))}</span>` : 'Recheck now', 'marked_down')}
      ${section('Pull or mark down today', '#B42318', now, r => `<span style="color:#B42318;font-weight:bold">${escape(when(r))}</span>`, 'today')}
      ${section('Coming up — next 5 days', '#B54708', soon, r => escape(when(r)), 'next5')}
    </div>
    <p style="font-size:12px;color:#4A5A52;text-align:center;margin:14px 0 0">Sent by FreshTrack. Change who gets this in FreshTrack → More → Settings.</p>
  </div></body></html>`

  return { subject, html }
}
