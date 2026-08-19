import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Resend } from 'resend'
initializeApp()
const database = getFirestore()

/**
 * Optional secondary delivery path (Resend), preserved from the existing implementation.
 * The primary path per the spec is Zapier polling GET /api/reminders (see /api/reminders.ts) —
 * that endpoint applies the identical inclusion rule (expiring<=5 days OR marked_down, never
 * cleared/removed) so both paths stay consistent if you run them side by side or migrate later.
 */
export const sendExpiryReminders = onSchedule({ schedule: '0 7 * * *', timeZone: 'America/Toronto', secrets: ['RESEND_API_KEY', 'REMINDER_TO_EMAIL'] }, async () => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = new Date(today); deadline.setDate(deadline.getDate() + 5)

  const [expiringSoon, markedDown] = await Promise.all([
    database.collection('codeDates').where('status', '==', 'active').where('expirationDate', '>=', Timestamp.fromDate(today)).where('expirationDate', '<=', Timestamp.fromDate(deadline)).get(),
    // Marked-down items stay in the reminder regardless of expiry date until cleared/removed — they need a recheck, not a re-expiry.
    database.collection('codeDates').where('status', '==', 'marked_down').get(),
  ])
  const codeDates = [...expiringSoon.docs, ...markedDown.docs].map(d => d.data())
  if (!codeDates.length) return

  const productIds = [...new Set(codeDates.map(c => c.productId as string))]
  const productDocs = await Promise.all(productIds.map(id => database.collection('products').doc(id).get()))
  const products = new Map(productDocs.filter(p => p.exists).map(p => [p.id, p.data()!]))

  const rows = codeDates
    .map(c => ({ name: String(products.get(c.productId)?.name ?? products.get(c.productId)?.description ?? 'Unnamed product'), expirationDate: (c.expirationDate as Timestamp).toDate(), quantity: c.quantity as number, status: c.status as string }))
    .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime())
    .map(i => `<tr><td>${escape(i.name)}</td><td>${escape(i.expirationDate.toLocaleDateString('en-CA'))}</td><td>${i.quantity}</td><td>${i.status === 'marked_down' ? 'Marked Down — Recheck' : 'Active'}</td></tr>`)
    .join('')

  const key = process.env.RESEND_API_KEY, recipient = process.env.REMINDER_TO_EMAIL
  if (!key || !recipient) { logger.warn('Reminder secrets are not configured.'); return }
  const result = await new Resend(key).emails.send({ from: 'FreshTrack <reminders@freshtrack.app>', to: recipient, subject: `FreshTrack: ${codeDates.length} items need attention`, html: `<h2>Expiry reminder</h2><table><tr><th>Product</th><th>Expires</th><th>Qty</th><th>Status</th></tr>${rows}</table>` })
  if (result.error) throw new Error(result.error.message)
})
function escape(value: unknown) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!) }
