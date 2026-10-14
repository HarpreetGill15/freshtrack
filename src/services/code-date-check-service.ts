import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { CodeDateCheck } from '../types/domain'

// localStorage (not sessionStorage) so a check survives closing the tab/browser or the phone
// locking mid-shift — the core "resume an unfinished check" requirement. This is device-local;
// resuming the same check from a different device goes through the Checks list.
const ACTIVE_CHECK_KEY = 'freshtrack-active-code-date-check'
// The check's details are cached next to its ID so the banner, scan and product screens can show it
// instantly instead of a network round trip on every screen. Verified against Firestore only where
// it matters (Home, Finish) — see getActiveCodeDateCheck's `verify` flag.
const ACTIVE_CHECK_CACHE_KEY = 'freshtrack-active-code-date-check-details'
const requiredDb = () => { if (!db) throw new Error('Firebase is not configured.'); return db }

function readStorage(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string | null) { try { if (value == null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value) } catch { /* storage unavailable (private mode) — the app still works, it just won't remember the check */ } }

export const activeCodeDateCheckId = () => readStorage(ACTIVE_CHECK_KEY)

function cachedActiveCheck(): CodeDateCheck | null {
  const id = activeCodeDateCheckId()
  if (!id) return null
  try {
    const parsed = JSON.parse(readStorage(ACTIVE_CHECK_CACHE_KEY) ?? 'null') as CodeDateCheck | null
    return parsed?.id === id ? parsed : null
  } catch { return null }
}

function cacheActiveCheck(check: CodeDateCheck | null) {
  writeStorage(ACTIVE_CHECK_CACHE_KEY, check ? JSON.stringify({ id: check.id, name: check.name, department: check.department, month: check.month, checkDate: check.checkDate, status: check.status }) : null)
}

/** Points this device at a check. Pass the full check when you have it so screens can show it without a lookup. */
export const setActiveCodeDateCheckId = (id: string | null, check?: CodeDateCheck) => {
  writeStorage(ACTIVE_CHECK_KEY, id)
  cacheActiveCheck(id && check?.id === id ? check : null)
}

export async function createCodeDateCheck(input: Omit<CodeDateCheck, 'id' | 'createdAt' | 'status' | 'completedAt'>) {
  const ref = await addDoc(collection(requiredDb(), 'codeDateChecks'), { ...input, status: 'active', createdAt: serverTimestamp() })
  const check = { id: ref.id, ...input, status: 'active' } as CodeDateCheck
  setActiveCodeDateCheckId(ref.id, check)
  return check
}

export async function getCodeDateCheck(id: string) {
  const snapshot = await getDoc(doc(requiredDb(), 'codeDateChecks', id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as CodeDateCheck) : null
}

/**
 * The check this device is working on. By default it answers from the on-device cache (instant);
 * `verify: true` also confirms with Firestore that it still exists and isn't completed, clearing a
 * stale pointer (check finished from another device, or deleted).
 */
export async function getActiveCodeDateCheck({ verify = false }: { verify?: boolean } = {}) {
  const id = activeCodeDateCheckId()
  if (!id) return null
  const cached = cachedActiveCheck()
  if (cached && !verify) return cached
  const check = await getCodeDateCheck(id)
  if (!check || check.status === 'completed') { setActiveCodeDateCheckId(null); return null }
  cacheActiveCheck(check)
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

/**
 * Looks for an already-active check for this month and department, so a quick re-date on an item
 * from an older check can attach to it directly instead of always sending staff through "start a
 * new check" — that flow is only actually needed the first time a given month/department combo
 * doesn't have a check yet.
 */
export async function findActiveCheckForMonth(month: string, department: string) {
  const snapshot = await getDocs(query(collection(requiredDb(), 'codeDateChecks'), where('status', '==', 'active'), where('month', '==', month), where('department', '==', department), limit(1)))
  return snapshot.empty ? null : ({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CodeDateCheck)
}

/**
 * Deletes a check and every code date recorded under it (e.g. removing test checks) — irreversible.
 * Requires a signed-in admin (firestore.rules). Deletes go out in batches of up to 500 rather than
 * one request per record.
 */
export async function deleteCodeDateCheck(id: string) {
  const database = requiredDb()
  const codeDates = await getDocs(query(collection(database, 'codeDates'), where('codeDateCheckId', '==', id)))
  const refs = [...codeDates.docs.map(item => item.ref), doc(database, 'codeDateChecks', id)]
  for (let i = 0; i < refs.length; i += 500) {
    const batch = writeBatch(database)
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref)
    await batch.commit()
  }
  if (activeCodeDateCheckId() === id) setActiveCodeDateCheckId(null)
}
