import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule, type ScheduledEvent } from 'firebase-functions/v2/scheduler'
import { Resend } from 'resend'
initializeApp()
const database = getFirestore()

type Row = { name: string; upc: string; department: string; expirationDate: Date; quantity: number; status: string; recheckAt?: Date; recheckDue: boolean }

/**
 * Optional secondary delivery path (Resend), preserved from the existing implementation.
 * The primary path per the spec is Zapier polling GET /api/reminders (see /api/reminders.ts) —
 * that endpoint applies the identical inclusion rule (expiring<=5 days OR marked_down, never
 * cleared/removed) so both paths stay consistent if you run them side by side or migrate later.
 */
async function buildAndSendReminders() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = new Date(today); deadline.setDate(deadline.getDate() + 5)

  const [expiringSoon, markedDown] = await Promise.all([
    database.collection('codeDates').where('status', '==', 'active').where('expirationDate', '>=', Timestamp.fromDate(today)).where('expirationDate', '<=', Timestamp.fromDate(deadline)).get(),
    // Marked-down items stay in the reminder regardless of expiry date until cleared/removed — they need a recheck, not a re-expiry.
    database.collection('codeDates').where('status', '==', 'marked_down').get(),
  ])
  const codeDates = [...expiringSoon.docs, ...markedDown.docs].map(d => d.data())
  if (!codeDates.length) { logger.info('No items need attention today — no email sent.'); return { sent: false, count: 0 } }

  const productIds = [...new Set(codeDates.map(c => c.productId as string))]
  const checkIds = [...new Set(codeDates.map(c => c.codeDateCheckId as string))]
  const [productDocs, checkDocs] = await Promise.all([
    Promise.all(productIds.map(id => database.collection('products').doc(id).get())),
    Promise.all(checkIds.map(id => database.collection('codeDateChecks').doc(id).get())),
  ])
  const products = new Map(productDocs.filter(p => p.exists).map(p => [p.id, p.data()!]))
  const checks = new Map(checkDocs.filter(c => c.exists).map(c => [c.id, c.data()!]))

  const rows: Row[] = codeDates.map(c => {
    const recheckAt = c.recheckAt ? (c.recheckAt as Timestamp).toDate() : undefined
    return {
      name: String(products.get(c.productId)?.name ?? products.get(c.productId)?.description ?? 'Unnamed product'),
      upc: String(products.get(c.productId)?.upc ?? products.get(c.productId)?.barcode ?? ''),
      department: String(checks.get(c.codeDateCheckId)?.department ?? ''),
      expirationDate: (c.expirationDate as Timestamp).toDate(),
      quantity: c.quantity as number,
      status: c.status as string,
      recheckAt,
      // Recheck is "due" once its target date has arrived — this is what actually needs someone to walk the floor today, not just anything marked down at some point.
      recheckDue: c.status === 'marked_down' && recheckAt != null && recheckAt.getTime() <= today.getTime(),
    }
  })

  // Rechecks come first (overdue ones first within that group) so they can't get scrolled past in a long email the way they were on the dashboard's default view.
  const recheckRows = rows.filter(r => r.status === 'marked_down').sort((a, b) => Number(b.recheckDue) - Number(a.recheckDue) || (a.recheckAt?.getTime() ?? 0) - (b.recheckAt?.getTime() ?? 0))
  const expiringRows = rows.filter(r => r.status !== 'marked_down').sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime())
  const recheckDueCount = recheckRows.filter(r => r.recheckDue).length

  const toTableRows = (list: Row[]) => list.map(r => `<tr>
    <td>${escape(r.name)}</td>
    <td style="font-family:monospace">${escape(r.upc || '—')}</td>
    <td>${escape(r.department)}</td>
    <td>${escape(r.expirationDate.toLocaleDateString('en-CA'))}</td>
    <td style="text-align:center">${r.quantity}</td>
    <td>${r.status === 'marked_down' ? `Marked Down${r.recheckAt ? ` — Recheck ${escape(r.recheckAt.toLocaleDateString('en-CA'))}${r.recheckDue ? ' <strong style="color:#b45309">(due now)</strong>' : ''}` : ' — Recheck'}` : 'Active'}</td>
  </tr>`).join('')

  const tableHead = '<tr><th align="left">Product</th><th align="left">UPC</th><th align="left">Dept</th><th align="left">Expires</th><th>Qty</th><th align="left">Status</th></tr>'
  const html = `<h2>FreshTrack daily reminder</h2>
    ${recheckRows.length ? `<h3 style="color:#b45309">Marked Down — Recheck Required (${recheckDueCount} due now)</h3><table cellpadding="6" style="border-collapse:collapse;width:100%">${tableHead}${toTableRows(recheckRows)}</table>` : ''}
    ${expiringRows.length ? `<h3>Needs Initial Action</h3><table cellpadding="6" style="border-collapse:collapse;width:100%">${tableHead}${toTableRows(expiringRows)}</table>` : ''}`

  const key = process.env.RESEND_API_KEY, recipient = process.env.REMINDER_TO_EMAIL
  if (!key || !recipient) { logger.warn('Reminder secrets are not configured (RESEND_API_KEY / REMINDER_TO_EMAIL).'); return { sent: false, count: rows.length } }
  // Resend's shared sandbox sender works with zero setup but only delivers to the email address that owns the Resend account — swap in RESEND_FROM_EMAIL once you verify your own sending domain.
  const from = process.env.RESEND_FROM_EMAIL || 'FreshTrack <onboarding@resend.dev>'
  const result = await new Resend(key).emails.send({ from, to: recipient, subject: `FreshTrack: ${rows.length} item${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} attention${recheckDueCount ? ` (${recheckDueCount} recheck${recheckDueCount === 1 ? '' : 's'} due)` : ''}`, html })
  if (result.error) throw new Error(result.error.message)
  logger.info(`Sent reminder email with ${rows.length} items (${recheckDueCount} rechecks due) to ${recipient}.`)
  return { sent: true, count: rows.length }
}

export const sendExpiryReminders = onSchedule({ schedule: '0 7 * * *', timeZone: 'America/Toronto', secrets: ['RESEND_API_KEY', 'REMINDER_TO_EMAIL', 'RESEND_FROM_EMAIL'] }, async (_event: ScheduledEvent) => { await buildAndSendReminders() })

/**
 * Manual test trigger — lets you fire the exact same reminder email on demand while setting this
 * up, instead of waiting for the 7am schedule. Protected by the same shared secret pattern as
 * /api/reminders.ts so it can't be used to spam the recipient. Call it with:
 *   curl -H "x-api-key: <TEST_TRIGGER_KEY>" https://<region>-<project>.cloudfunctions.net/testSendExpiryReminders
 */
export const testSendExpiryReminders = onRequest({ secrets: ['RESEND_API_KEY', 'REMINDER_TO_EMAIL', 'RESEND_FROM_EMAIL', 'TEST_TRIGGER_KEY'] }, async (req, res) => {
  const expectedKey = process.env.TEST_TRIGGER_KEY
  if (!expectedKey) { res.status(500).json({ error: 'TEST_TRIGGER_KEY is not configured on the server.' }); return }
  if (req.headers['x-api-key'] !== expectedKey) { res.status(401).json({ error: 'Invalid or missing API key.' }); return }
  try {
    const result = await buildAndSendReminders()
    res.status(200).json(result)
  } catch (error) {
    logger.error('Manual reminder trigger failed', error)
    res.status(500).json({ error: 'Could not send reminder email.' })
  }
})

function escape(value: unknown) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!) }
