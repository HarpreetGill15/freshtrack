import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { app, db, firebaseNotConfiguredMessage } from '../lib/firebase'

const settingsRef = () => { if (!db) throw new Error(firebaseNotConfiguredMessage); return doc(db, 'settings', 'reminders') }

/** The store email address(es) every department's daily email goes to. Store logins only (firestore.rules). */
export async function getStoreEmails(): Promise<string[]> {
  const data = (await getDoc(settingsRef())).data()
  return Array.isArray(data?.storeEmails) ? data.storeEmails.map(String) : []
}

export async function saveStoreEmails(storeEmails: string[]) {
  await setDoc(settingsRef(), { storeEmails, updatedAt: serverTimestamp() }, { merge: true })
}

/** Splits what was typed (commas, spaces, new lines) into addresses; returns the ones that don't look like emails too. */
export function parseEmails(text: string) {
  const parts = text.split(/[\s,;]+/).map(part => part.trim()).filter(Boolean)
  const valid = parts.filter(part => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(part))
  return { valid: [...new Set(valid.map(v => v.toLowerCase()))], invalid: parts.filter(part => !valid.includes(part)) }
}

export type EmailPreview = { list: string; to: string[]; count: number; subject: string; html: string }
export type SendResult = { list: string; to: string[]; count: number; sent: boolean; reason?: string }

/** Calls the daily-email function as the signed-in store login: a preview (nothing sent) or a test send right now. */
async function callSendReminder(dryRun: boolean, to: string[] = []) {
  const user = app ? getAuth(app).currentUser : null
  if (!user) throw new Error('Sign in first.')
  const query = dryRun ? '?dryRun=1' : to.length ? `?to=${encodeURIComponent(to.join(','))}` : ''
  const response = await fetch(`/api/send-reminder${query}`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
  const raw = await response.text()
  let data: { error?: string; emails?: EmailPreview[]; results?: SendResult[] } = {}
  try { data = JSON.parse(raw) } catch { /* not JSON — e.g. the server crashed before it could answer */ }
  // Show the real reason (status code + the start of the server's reply) so problems can be fixed quickly.
  if (!response.ok) throw new Error(data.error ?? `The email service failed (${response.status}): ${raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'no reply'}`)
  return data
}
export const previewEmails = async () => (await callSendReminder(true)).emails ?? []
/** Sends today's emails now, to `to` if given (what's typed in the Store email box) or else the saved store email. */
export const sendTestEmails = async (to: string[] = []) => (await callSendReminder(false, to)).results ?? []
