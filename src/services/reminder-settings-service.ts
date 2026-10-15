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
async function callSendReminder(dryRun: boolean) {
  const user = app ? getAuth(app).currentUser : null
  if (!user) throw new Error('Sign in first.')
  const response = await fetch(`/api/send-reminder${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
  const data = await response.json().catch(() => ({})) as { error?: string; emails?: EmailPreview[]; results?: SendResult[] }
  if (!response.ok) throw new Error(data.error ?? 'The email service did not respond.')
  return data
}
export const previewEmails = async () => (await callSendReminder(true)).emails ?? []
export const sendTestEmails = async () => (await callSendReminder(false)).results ?? []
