import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { Resend } from 'resend'
import { adminApp, DEPARTMENTS, fetchReminderRows, getFirestore, getStoreEmails, STORE_EMAILS, storeDay, storeHour, type ReminderRow } from './_lib/reminder-data'

/**
 * Daily code-date emails — a separate email per department (Grocery, Dairy, Meat, Produce), all sent
 * to the store's email address. Each is a plain, print-friendly checklist (no links) that staff can
 * print, photograph or read on screen and work through. A department with nothing due gets no email
 * that day. The store email is set in the app under More → Settings.
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

    const [rows, savedEmails] = await Promise.all([fetchReminderRows(database, undefined, undefined, now), getStoreEmails(database)])
    // A test send from Settings can go to whatever is typed in the Store email box, saved or not.
    const typed = !isCron && typeof req.query.to === 'string' ? req.query.to.split(',').map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) : []
    const storeEmails = typed.length ? typed : savedEmails
    const emails = DEPARTMENTS.map(department => {
      const departmentRows = rows.filter(r => r.area === department)
      return { list: department, to: storeEmails, rows: departmentRows, ...buildEmail(department, departmentRows, today) }
    })

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
      if (!email.to.length) { results.push({ list: email.list, to: [], count: email.rows.length, sent: false, reason: 'No store email set' }); continue }
      // A test on a day with nothing due still sends one email (the first department's "nothing due") so you can see it arrive.
      const sendEmptyForTest = !isCron && !emails.some(e => e.rows.length) && email === emails[0]
      if (!email.rows.length && !sendEmptyForTest) { results.push({ list: email.list, to: email.to, count: 0, sent: false, reason: 'Nothing due today' }); continue }
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

  return { subject, html }
}
