import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminApp, fetchReminderRows, getFirestore } from './_lib/reminder-data'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Shared-secret auth: Zapier sends this as a header or query param. Rotate ZAPIER_API_KEY in
  // Vercel env vars any time; there is no other authentication on this endpoint, so keep it secret.
  const providedKey = req.headers['x-api-key'] ?? req.query.apiKey
  const expectedKey = process.env.ZAPIER_API_KEY
  if (!expectedKey) return res.status(500).json({ error: 'ZAPIER_API_KEY is not configured on the server.' })
  if (providedKey !== expectedKey) return res.status(401).json({ error: 'Invalid or missing API key.' })

  try {
    const database = getFirestore(adminApp())
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined
    const checkParam = typeof req.query.check === 'string' ? req.query.check : undefined
    const areaParam = typeof req.query.area === 'string' ? req.query.area.toLowerCase() : undefined
    const sectionParam = typeof req.query.section === 'string' ? req.query.section.toLowerCase() : undefined
    // "store" filtering is accepted for forward-compatibility but is currently a no-op: the data
    // model has no store/location field yet (see PROJECT_STATUS.md — multi-store is a known gap).

    const rows = (await fetchReminderRows(database, statusParam, checkParam))
      .filter(row => (!areaParam || row.area.toLowerCase() === areaParam) && (!sectionParam || row.section.toLowerCase() === sectionParam))
      .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))

    return res.status(200).json({ count: rows.length, generatedAt: new Date().toISOString(), items: rows })
  } catch (error) {
    console.error('reminders endpoint failed', error)
    return res.status(500).json({ error: 'Could not load reminder data.' })
  }
}
