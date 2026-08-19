import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Firebase Admin credentials come from server-only env vars — never committed, never sent to the
// browser. Set these in Vercel Project Settings > Environment Variables (see DEPLOYMENT.md).
function adminApp() {
  if (getApps().length) return getApps()[0]
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin credentials are not configured on the server.')
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

type Row = { product: string; description: string; upc: string; vendorCode: string; subDepartment: string; expirationDate: string; daysRemaining: number; quantity: number; status: string; area: string; section: string; codeDateCheck: string; needsRecheck: boolean }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Shared-secret auth: Zapier sends this as a header or query param. Rotate ZAPIER_API_KEY in
  // Vercel env vars any time; there is no other authentication on this endpoint, so keep it secret.
  const providedKey = req.headers['x-api-key'] ?? req.query.apiKey
  const expectedKey = process.env.ZAPIER_API_KEY
  if (!expectedKey) return res.status(500).json({ error: 'ZAPIER_API_KEY is not configured on the server.' })
  if (providedKey !== expectedKey) return res.status(401).json({ error: 'Invalid or missing API key.' })

  try {
    const database = getFirestore(adminApp())
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const deadline = new Date(today); deadline.setDate(deadline.getDate() + 5)

    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined
    const checkParam = typeof req.query.check === 'string' ? req.query.check : undefined
    const areaParam = typeof req.query.area === 'string' ? req.query.area.toLowerCase() : undefined
    const sectionParam = typeof req.query.section === 'string' ? req.query.section.toLowerCase() : undefined
    // "store" filtering is accepted for forward-compatibility but is currently a no-op: the data
    // model has no store/location field yet (see PROJECT_STATUS.md — multi-store is a known gap).

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
        database.collection('codeDates').where('status', '==', 'marked_down').get(),
      ])
      codeDateDocs = [...expiringSoon.docs, ...markedDown.docs]
    }

    // Cleared/removed are always excluded from the reminder feed, even if an explicit check/status filter didn't already exclude them.
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

    const rows: Row[] = codeDates
      .map(c => {
        const product = products.get(c.productId as string)
        const check = checks.get(c.codeDateCheckId as string)
        const expirationDate = (c.expirationDate as Timestamp).toDate()
        return {
          product: String(product?.name ?? product?.description ?? 'Unnamed product'),
          description: String(product?.description ?? ''),
          upc: String(product?.upc ?? product?.barcode ?? ''),
          vendorCode: String(product?.vendorCode ?? ''),
          subDepartment: String(product?.subDepartment ?? ''),
          expirationDate: expirationDate.toISOString().slice(0, 10),
          daysRemaining: Math.ceil((expirationDate.setHours(0, 0, 0, 0) - today.getTime()) / 86400000),
          quantity: c.quantity as number,
          status: c.status as string,
          area: String(check?.department ?? ''),
          section: String(check?.section ?? ''),
          codeDateCheck: String(check?.name ?? ''),
          needsRecheck: c.status === 'marked_down',
        }
      })
      .filter(row => (!areaParam || row.area.toLowerCase() === areaParam) && (!sectionParam || row.section.toLowerCase() === sectionParam))
      .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))

    return res.status(200).json({ count: rows.length, generatedAt: new Date().toISOString(), items: rows })
  } catch (error) {
    console.error('reminders endpoint failed', error)
    return res.status(500).json({ error: 'Could not load reminder data.' })
  }
}
