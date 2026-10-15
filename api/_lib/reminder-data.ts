import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'

// Firebase Admin credentials come from server-only Vercel env vars — never committed, never sent to
// the browser. Either paste the whole service-account JSON file into FIREBASE_SERVICE_ACCOUNT (easiest),
// or set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY separately.
export function adminApp() {
  if (getApps().length) return getApps()[0]
  const json = process.env.FIREBASE_SERVICE_ACCOUNT
  if (json) {
    const parsed = JSON.parse(json) as { project_id: string; client_email: string; private_key: string }
    return initializeApp({ credential: cert({ projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key } as ServiceAccount) })
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin credentials are not configured on the server (FIREBASE_SERVICE_ACCOUNT).')
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

export const DEPARTMENTS = ['Grocery', 'Dairy', 'Meat', 'Produce'] as const
export const STORE_TIME_ZONE = 'America/Toronto'
/** The two store logins (see src/hooks/use-auth.ts) — the only accounts allowed to preview or test-send. */
export const STORE_EMAILS = ['928@freshtrack.local', 'h@freshtrack.local']

/**
 * Calendar day (YYYY-MM-DD) in the store's time zone. The server runs on UTC, so plain
 * toISOString() would call it "tomorrow" every evening and flag rechecks a day late in the morning.
 */
export const storeDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export const storeHour = (date: Date) => Number(new Intl.DateTimeFormat('en-US', { timeZone: STORE_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(date))
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

export type ReminderRow = { product: string; description: string; upc: string; vendorCode: string; subDepartment: string; expirationDate: string; daysRemaining: number; quantity: number; status: string; recheckAt?: string; recheckDue: boolean; area: string; section: string; codeDateCheck: string; needsRecheck: boolean }

/**
 * Shared by /api/reminders (Zapier's JSON feed) and /api/send-reminder (the daily emails).
 * Default set: active items expiring within 5 days (overdue included — those need action most) and
 * marked-down items whose recheck is due (or that have no recheck date). Never cleared/removed.
 * `statusParam` / `checkParam` let /api/reminders narrow the query for its optional filters.
 */
export async function fetchReminderRows(database: Firestore, statusParam?: string, checkParam?: string, now = new Date()): Promise<ReminderRow[]> {
  const today = storeDay(now)
  const deadline = new Date(now.getTime() + 6 * 86400000) // generous; trimmed by daysRemaining below

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = []
  if (checkParam) docs = (await database.collection('codeDates').where('codeDateCheckId', '==', checkParam).get()).docs
  else if (statusParam) docs = (await database.collection('codeDates').where('status', '==', statusParam).get()).docs
  else {
    const [expiring, markedDown] = await Promise.all([
      database.collection('codeDates').where('status', '==', 'active').where('expirationDate', '<=', Timestamp.fromDate(deadline)).get(),
      database.collection('codeDates').where('status', '==', 'marked_down').get(),
    ])
    docs = [...expiring.docs, ...markedDown.docs]
  }
  const codeDates = docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string })).filter(c => c.status !== 'cleared' && c.status !== 'removed')

  // Records saved since the speed update carry their product/check details; only older ones need a lookup.
  const needsLookup = codeDates.filter(c => c.productName == null || c.department == null)
  const productIds = [...new Set(needsLookup.map(c => c.productId as string))]
  const checkIds = [...new Set(codeDates.map(c => c.codeDateCheckId as string))] // section only lives on the check
  const [productDocs, checkDocs] = await Promise.all([
    productIds.length ? database.getAll(...productIds.map(id => database.collection('products').doc(id))) : Promise.resolve([]),
    checkIds.length ? database.getAll(...checkIds.map(id => database.collection('codeDateChecks').doc(id))) : Promise.resolve([]),
  ])
  const products = new Map(productDocs.filter(p => p.exists).map(p => [p.id, p.data()!]))
  const checks = new Map(checkDocs.filter(c => c.exists).map(c => [c.id, c.data()!]))

  const rows = codeDates.map(c => {
    const product = products.get(c.productId as string)
    const check = checks.get(c.codeDateCheckId as string)
    const expiry = storeDay((c.expirationDate as Timestamp).toDate())
    const recheck = c.recheckAt ? storeDay((c.recheckAt as Timestamp).toDate()) : undefined
    return {
      product: String(c.productName ?? product?.name ?? product?.description ?? 'Unnamed product'),
      description: String(c.description ?? product?.description ?? ''),
      upc: String(c.upc ?? product?.upc ?? product?.barcode ?? ''),
      vendorCode: String(c.vendorCode ?? product?.vendorCode ?? ''),
      subDepartment: String(c.subDepartment ?? product?.subDepartment ?? ''),
      expirationDate: expiry,
      daysRemaining: dayDiff(today, expiry),
      quantity: Number(c.quantity ?? 0),
      status: String(c.status),
      recheckAt: recheck,
      // Due once its date has arrived — the ones someone needs to walk over and look at today.
      recheckDue: c.status === 'marked_down' && (recheck == null || recheck <= today),
      area: String(c.department ?? check?.department ?? ''),
      section: String(check?.section ?? ''),
      codeDateCheck: String(c.codeDateCheckName ?? check?.name ?? ''),
      needsRecheck: c.status === 'marked_down',
    }
  })

  if (checkParam || statusParam) return rows
  return rows.filter(r => r.status === 'marked_down' ? r.recheckDue : r.daysRemaining <= 5)
}

/** The store's email address(es) — every department's email goes here. Set in the app under More → Settings (settings/reminders). */
export async function getStoreEmails(database: Firestore): Promise<string[]> {
  const data = (await database.collection('settings').doc('reminders').get()).data() ?? {}
  return Array.isArray(data.storeEmails) ? data.storeEmails.map(String).map((s: string) => s.trim()).filter(Boolean) : []
}

export { getFirestore }
