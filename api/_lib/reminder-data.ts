import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'

// Firebase Admin credentials come from server-only env vars — never committed, never sent to the
// browser. Set these in Vercel Project Settings > Environment Variables (see DEPLOYMENT.md).
export function adminApp() {
  if (getApps().length) return getApps()[0]
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin credentials are not configured on the server.')
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

export type ReminderRow = { product: string; description: string; upc: string; vendorCode: string; subDepartment: string; expirationDate: string; daysRemaining: number; quantity: number; status: string; recheckAt?: string; recheckDue: boolean; area: string; section: string; codeDateCheck: string; needsRecheck: boolean }

/**
 * Shared by /api/reminders (Zapier's JSON feed) and /api/send-reminder (the Vercel Cron email) so
 * the inclusion rule — expiring within 5 days OR marked_down, never cleared/removed — and the
 * product/check join only need to be written once. `statusParam`/`checkParam` let /api/reminders
 * narrow the query for its optional filters; the cron email always wants the unfiltered default set.
 */
export async function fetchReminderRows(database: Firestore, statusParam?: string, checkParam?: string): Promise<ReminderRow[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const deadline = new Date(today); deadline.setDate(deadline.getDate() + 5)

  let codeDateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = []
  if (checkParam) {
    const snap = await database.collection('codeDates').where('codeDateCheckId', '==', checkParam).get()
    codeDateDocs = snap.docs
  } else if (statusParam) {
    const snap = await database.collection('codeDates').where('status', '==', statusParam).get()
    codeDateDocs = snap.docs
  } else {
    const [expiringSoon, markedDown] = await Promise.all([
      database.collection('codeDates').where('status', '==', 'active').where('expirationDate', '>=', Timestamp.fromDate(today)).where('expirationDate', '<=', Timestamp.fromDate(deadline)).get(),
      // Marked-down items stay in the reminder regardless of expiry date until cleared/removed — they need a recheck, not a re-expiry.
      database.collection('codeDates').where('status', '==', 'marked_down').get(),
    ])
    codeDateDocs = [...expiringSoon.docs, ...markedDown.docs]
  }

  // Cleared/removed are always excluded, even if an explicit check/status filter didn't already exclude them.
  codeDateDocs = codeDateDocs.filter(d => !['cleared', 'removed'].includes(d.data().status))

  const codeDates = codeDateDocs.map(d => ({ id: d.id, ...d.data() }))
  const productIds = [...new Set(codeDates.map(c => c.productId as string))]
  const checkIds = [...new Set(codeDates.map(c => c.codeDateCheckId as string))]
  const [productDocs, checkDocs] = await Promise.all([
    Promise.all(productIds.map(id => database.collection('products').doc(id).get())),
    Promise.all(checkIds.map(id => database.collection('codeDateChecks').doc(id).get())),
  ])
  const products = new Map(productDocs.filter(p => p.exists).map(p => [p.id, p.data()!]))
  const checks = new Map(checkDocs.filter(c => c.exists).map(c => [c.id, c.data()!]))

  return codeDates.map(c => {
    const product = products.get(c.productId as string)
    const check = checks.get(c.codeDateCheckId as string)
    const expirationDate = (c.expirationDate as Timestamp).toDate()
    const recheckAt = c.recheckAt ? (c.recheckAt as Timestamp).toDate() : undefined
    return {
      product: String(product?.name ?? product?.description ?? 'Unnamed product'),
      description: String(product?.description ?? ''),
      upc: String(product?.upc ?? product?.barcode ?? ''),
      vendorCode: String(product?.vendorCode ?? ''),
      subDepartment: String(product?.subDepartment ?? ''),
      expirationDate: expirationDate.toISOString().slice(0, 10),
      daysRemaining: Math.ceil((new Date(expirationDate).setHours(0, 0, 0, 0) - today.getTime()) / 86400000),
      quantity: c.quantity as number,
      status: c.status as string,
      recheckAt: recheckAt?.toISOString().slice(0, 10),
      // Recheck is "due" once its target date has arrived — the ones that actually need someone to walk the floor today.
      recheckDue: c.status === 'marked_down' && recheckAt != null && recheckAt.getTime() <= today.getTime(),
      area: String(check?.department ?? ''),
      section: String(check?.section ?? ''),
      codeDateCheck: String(check?.name ?? ''),
      needsRecheck: c.status === 'marked_down',
    }
  })
}

export { getFirestore }
