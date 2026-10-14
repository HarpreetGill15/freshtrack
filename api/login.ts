import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { adminApp } from './_lib/reminder-data'

/**
 * Back-office sign-in. The username/password live only in Vercel env vars (ADMIN_USERNAME /
 * ADMIN_PASSWORD) — never in the repo or the browser bundle. A correct pair gets a Firebase custom
 * token carrying `admin: true`, which the browser exchanges for a real Firebase session. That claim
 * is what firestore.rules checks before allowing a check (or its code dates) to be deleted.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  const expectedUser = process.env.ADMIN_USERNAME
  const expectedPassword = process.env.ADMIN_PASSWORD
  if (!expectedUser || !expectedPassword) return res.status(500).json({ error: 'Sign-in is not configured on the server.' })

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')
  if (username !== expectedUser || password !== expectedPassword) return res.status(401).json({ error: 'Incorrect username or password.' })

  try {
    const token = await getAuth(adminApp()).createCustomToken('store-admin', { admin: true })
    return res.status(200).json({ token })
  } catch (error) {
    console.error('login token creation failed', error)
    return res.status(500).json({ error: 'Could not sign in right now.' })
  }
}

function safeJson(text: string) { try { return JSON.parse(text) } catch { return null } }
