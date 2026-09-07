import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'
import { adminApp, fetchReminderRows, getFirestore, type ReminderRow } from './_lib/reminder-data'

const escape = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!)

function buildHtml(rows: ReminderRow[]) {
  // Rechecks come first (overdue ones first within that group) so they can't get scrolled past unnoticed, the same ordering the dashboard uses.
  const recheckRows = rows.filter(r => r.needsRecheck).sort((a, b) => Number(b.recheckDue) - Number(a.recheckDue) || (a.recheckAt ?? '').localeCompare(b.recheckAt ?? ''))
  const expiringRows = rows.filter(r => !r.needsRecheck).sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))
  const recheckDueCount = recheckRows.filter(r => r.recheckDue).length

  const toTableRows = (list: ReminderRow[]) => list.map(r => `<tr>
    <td>${escape(r.product)}</td>
    <td style="font-family:monospace">${escape(r.upc || '—')}</td>
    <td>${escape(r.area)}</td>
    <td>${escape(r.expirationDate)}</td>
    <td style="text-align:center">${r.quantity}</td>
    <td>${r.needsRecheck ? `Marked Down${r.recheckAt ? ` — Recheck ${escape(r.recheckAt)}${r.recheckDue ? ' <strong style="color:#b45309">(due now)</strong>' : ''}` : ' — Recheck'}` : 'Active'}</td>
  </tr>`).join('')

  const tableHead = '<tr><th align="left">Product</th><th align="left">UPC</th><th align="left">Area</th><th align="left">Expires</th><th>Qty</th><th align="left">Status</th></tr>'
  return { recheckDueCount, html: `<h2>FreshTrack daily reminder</h2>
    ${recheckRows.length ? `<h3 style="color:#b45309">Marked Down — Recheck Required (${recheckDueCount} due now)</h3><table cellpadding="6" style="border-collapse:collapse;width:100%">${tableHead}${toTableRows(recheckRows)}</table>` : ''}
    ${expiringRows.length ? `<h3>Needs Initial Action</h3><table cellpadding="6" style="border-collapse:collapse;width:100%">${tableHead}${toTableRows(expiringRows)}</table>` : ''}` }
}

/**
 * Triggered daily by Vercel Cron (see the `crons` entry in vercel.json) — Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on cron-triggered requests once CRON_SECRET is set as an env
 * var, which is what gates this in production. The `x-api-key` / `apiKey` fallback (same shared
 * secret as /api/reminders) exists purely so this can be triggered manually to test it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  const isCronRequest = cronSecret != null && req.headers.authorization === `Bearer ${cronSecret}`
  const providedKey = req.headers['x-api-key'] ?? req.query.apiKey
  const isManualTest = providedKey != null && providedKey === process.env.ZAPIER_API_KEY
  if (!isCronRequest && !isManualTest) return res.status(401).json({ error: 'Invalid or missing authorization.' })

  try {
    const database = getFirestore(adminApp())
    const rows = await fetchReminderRows(database)
    if (!rows.length) return res.status(200).json({ sent: false, count: 0 })

    const { html, recheckDueCount } = buildHtml(rows)
    const key = process.env.RESEND_API_KEY, recipient = process.env.REMINDER_TO_EMAIL
    if (!key || !recipient) return res.status(500).json({ error: 'RESEND_API_KEY / REMINDER_TO_EMAIL are not configured on the server.' })
    // Resend's shared sandbox sender works with zero setup but only delivers to the email address that owns the Resend account — set RESEND_FROM_EMAIL once you verify your own sending domain.
    const from = process.env.RESEND_FROM_EMAIL || 'FreshTrack <onboarding@resend.dev>'
    const result = await new Resend(key).emails.send({ from, to: recipient, subject: `FreshTrack: ${rows.length} item${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} attention${recheckDueCount ? ` (${recheckDueCount} recheck${recheckDueCount === 1 ? '' : 's'} due)` : ''}`, html })
    if (result.error) throw new Error(result.error.message)

    return res.status(200).json({ sent: true, count: rows.length, recheckDueCount })
  } catch (error) {
    console.error('send-reminder endpoint failed', error)
    return res.status(500).json({ error: 'Could not send reminder email.' })
  }
}
