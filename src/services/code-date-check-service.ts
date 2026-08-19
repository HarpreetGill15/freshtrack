import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { CodeDateCheck } from '../types/domain'

// localStorage (not sessionStorage) so a check survives closing the tab/browser or the phone
// locking mid-shift — the core "resume an unfinished check" requirement. This is device-local;
// resuming the same check from a different device would need real auth, which is out of scope
// for the no-login MVP workflow.
const ACTIVE_CHECK_KEY = 'freshtrack-active-code-date-check'
const requiredDb = () => { if (!db) throw new Error('Firebase is not configured.'); return db }

export const activeCodeDateCheckId = () => window.localStorage.getItem(ACTIVE_CHECK_KEY)
export const setActiveCodeDateCheckId = (id: string | null) => { if (id) window.localStorage.setItem(ACTIVE_CHECK_KEY, id); else window.localStorage.removeItem(ACTIVE_CHECK_KEY) }

export async function createCodeDateCheck(input: Omit<CodeDateCheck, 'id' | 'createdAt' | 'status' | 'completedAt'>) {
  const ref = await addDoc(collection(requiredDb(), 'codeDateChecks'), { ...input, status: 'active', createdAt: serverTimestamp() })
  setActiveCodeDateCheckId(ref.id)
  return { id: ref.id, ...input, status: 'active' } as CodeDateCheck
}

export async function getCodeDateCheck(id: string) {
  const snapshot = await getDoc(doc(requiredDb(), 'codeDateChecks', id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as CodeDateCheck) : null
}

export async function getActiveCodeDateCheck() {
  const id = activeCodeDateCheckId()
  if (!id) return null
  const check = await getCodeDateCheck(id)
  // The pointer can go stale (check completed elsewhere, or Firestore doc removed) — clear it rather than resuming a dead check.
  if (!check || check.status === 'completed') { setActiveCodeDateCheckId(null); return null }
  return check
}

export async function completeCodeDateCheck(id: string) {
  await updateDoc(doc(requiredDb(), 'codeDateChecks', id), { status: 'completed', completedAt: serverTimestamp() })
  if (activeCodeDateCheckId() === id) setActiveCodeDateCheckId(null)
}

/** Every check, most recent first — used by the admin Checks list so exports work from any computer, not just the phone that did the scanning. */
export async function listCodeDateChecks(count = 50) {
  const snapshot = await getDocs(query(collection(requiredDb(), 'codeDateChecks'), orderBy('createdAt', 'desc'), limit(count)))
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() } as CodeDateCheck))
}
