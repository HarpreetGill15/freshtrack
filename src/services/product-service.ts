import { addDoc, collection, count, doc, documentId, getAggregateFromServer, getDoc, getDocs, increment, orderBy, query, serverTimestamp, setDoc, sum, updateDoc, where, writeBatch, type DocumentData, type FieldValue, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db, firebaseNotConfiguredMessage } from '../lib/firebase'
import { normalizeScannedUpc, normalizeUpc } from '../lib/upc'
import type { CodeDate, CodeDateCheck, CodeDateDetails, DashboardEntry, Product, ProductStatus } from '../types/domain'

const database = () => { if (!db) throw new Error(firebaseNotConfiguredMessage); return db }
const asDate = (value: unknown) => value && typeof value === 'object' && 'toDate' in value ? (value as { toDate(): Date }).toDate() : new Date(value as string)
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
/** Local calendar day as YYYY-MM-DD (not toISOString, which is UTC and flips to tomorrow in the evening). */
const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const normalize = (documentId: string, data: Record<string, unknown>) => ({
  id: documentId,
  ...data,
  name: String(data.name ?? data.description ?? 'Unnamed product'),
  active: data.active !== false,
} as Product)

/**
 * Finds a product from a typed or scanned UPC. Every plausible form of the code (canonical 12-digit,
 * raw digits as typed, and camera-scan without its check digit) is tried at once:
 *   1. direct document lookups for all of them in parallel (UPC is the document ID), then
 *   2. only if none hit, one `upc in [...]` and one `barcode in [...]` query in parallel for older records.
 * That's at most two round trips; the previous version tried each form one after another, which
 * could take up to nine sequential lookups for an item not in the catalogue.
 */
export async function findProductByUpc(rawUpc: string) {
  const canonical = normalizeUpc(rawUpc)
  if (!canonical) return null
  const firestore = database()
  const rawDigits = rawUpc.replace(/\D/g, '')
  const candidates = [...new Set([canonical, rawDigits, normalizeScannedUpc(rawDigits)].filter(Boolean))]

  const direct = await Promise.all(candidates.map(code => getDoc(doc(firestore, 'products', code))))
  const directHit = direct.find(snapshot => snapshot.exists())
  if (directHit) return normalize(directHit.id, directHit.data()!)

  const [byUpc, byBarcode] = await Promise.all([
    getDocs(query(collection(firestore, 'products'), where('upc', 'in', candidates))),
    getDocs(query(collection(firestore, 'products'), where('barcode', 'in', candidates))),
  ])
  // Keep the old preference order: a match on the canonical form beats one on a fallback form.
  const matches = [...byUpc.docs, ...byBarcode.docs]
  for (const code of candidates) {
    const hit = matches.find(item => item.data().upc === code || item.data().barcode === code)
    if (hit) return normalize(hit.id, hit.data())
  }
  return null
}

/**
 * `fromCameraScan: true` means `product.upc` is a raw code read off a printed barcode (carries a
 * genuine check digit) rather than typed/imported in the catalogue's no-check-digit convention — it
 * gets normalized with normalizeScannedUpc so the saved record lines up with how future scans of the
 * same item resolve (see findProductByUpc's check-digit fallback).
 */
export async function saveScannedProduct(product: { upc: string; name: string; description: string; brand?: string; vendorCode?: string; subDepartment?: string; imageUrl?: string }, fromCameraScan = false) {
  const upc = fromCameraScan ? normalizeScannedUpc(product.upc) : normalizeUpc(product.upc)
  const existing = await findProductByUpc(upc)
  if (existing) return existing
  const firestore = database()
  const ref = doc(firestore, 'products', upc)
  await setDoc(ref, { ...product, upc, barcode: upc, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
  return { id: ref.id, barcode: upc, active: true, ...product, upc } as Product
}

export async function getProduct(productId: string) { const snapshot = await getDoc(doc(database(), 'products', productId)); return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null }

function toCodeDate(item: QueryDocumentSnapshot<DocumentData>): CodeDate {
  const data = item.data()
  return {
    ...data,
    id: item.id,
    expirationDate: asDate(data.expirationDate),
    recheckAt: data.recheckAt ? asDate(data.recheckAt) : undefined,
    createdAt: data.createdAt ? asDate(data.createdAt) : undefined,
  } as CodeDate
}

export async function getCodeDates(productId: string) { const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('productId', '==', productId), orderBy('expirationDate'))); return snapshot.docs.map(toCodeDate) }

/** The product/check details copied onto a new code date record (see CodeDate in types/domain.ts). */
export function codeDateDetails(product: Product, check: Pick<CodeDateCheck, 'name' | 'department' | 'month'>): CodeDateDetails {
  return {
    productName: product.name,
    description: product.description ?? '',
    upc: product.upc || product.barcode || '',
    vendorCode: product.vendorCode ?? '',
    subDepartment: product.subDepartment ?? '',
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    department: check.department,
    codeDateCheckName: check.name,
    codeDateCheckMonth: check.month,
  }
}

/** Same, taken from a dashboard row (used by the dashboard's quick "add new date"). */
export function codeDateDetailsFromEntry(entry: DashboardEntry): CodeDateDetails {
  return {
    productName: entry.productName,
    description: entry.description,
    upc: entry.upc,
    vendorCode: entry.vendorCode,
    subDepartment: entry.subDepartment,
    ...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {}),
    department: entry.department,
    codeDateCheckName: entry.codeDateCheckName,
    codeDateCheckMonth: entry.codeDateCheckMonth,
  }
}

/**
 * Adds a code date, or — if an active code date already exists for the same product, the same
 * Code Date Check, and the same calendar day — increases that existing record's quantity instead
 * of creating a duplicate.
 *
 * Only reads this product's records *within this check* (a handful at most), not its whole
 * history across every check like before, and the quantity bump is an atomic `increment()`. New
 * records get a predictable ID (check_product_day), so two phones adding the same item offline
 * merge into one record when they sync instead of creating a duplicate.
 */
export async function addOrIncrementCodeDate(input: Omit<CodeDate, 'id' | 'createdAt' | 'updatedAt' | 'status'>, details?: CodeDateDetails) {
  const firestore = database()
  const inCheck = await getDocs(query(collection(firestore, 'codeDates'), where('productId', '==', input.productId), where('codeDateCheckId', '==', input.codeDateCheckId)))
  const existing = inCheck.docs.map(toCodeDate)
  const match = existing.find(item => item.status === 'active' && sameDay(item.expirationDate, input.expirationDate))
  if (match) {
    await updateDoc(doc(firestore, 'codeDates', match.id), { quantity: increment(input.quantity), updatedAt: serverTimestamp(), ...(details ?? {}) })
    return { merged: true as const, id: match.id, quantity: match.quantity + input.quantity }
  }

  const predictableId = `${input.codeDateCheckId}_${input.productId}_${localDayKey(input.expirationDate)}`
  const payload = { ...input, ...(details ?? {}), status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  // The predictable ID is already taken by a record that was since sold/removed — new stock with the same date gets its own record.
  if (existing.some(item => item.id === predictableId)) {
    const ref = await addDoc(collection(firestore, 'codeDates'), payload)
    return { merged: false as const, id: ref.id, quantity: input.quantity }
  }
  await setDoc(doc(firestore, 'codeDates', predictableId), { ...payload, quantity: increment(input.quantity) }, { merge: true })
  return { merged: false as const, id: predictableId, quantity: input.quantity }
}

export async function setCodeDateStatus(codeDateId: string, status: ProductStatus, recheckAt?: Date) {
  const payload: { status: ProductStatus; updatedAt: FieldValue; markedDownAt?: FieldValue; recheckAt?: Date | null } = { status, updatedAt: serverTimestamp() }
  if (status === 'marked_down') { payload.markedDownAt = serverTimestamp(); payload.recheckAt = recheckAt ?? null }
  await updateDoc(doc(database(), 'codeDates', codeDateId), payload)
}

/**
 * Fetches many documents by ID in batched `documentId() in [...]` queries (chunks of 30, Firestore's
 * `in` limit) instead of one `getDoc` per ID.
 */
async function getDocsByIds(firestore: ReturnType<typeof database>, collectionName: string, ids: string[]) {
  const map = new Map<string, Record<string, unknown>>()
  if (!ids.length) return map
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  const snapshots = await Promise.all(chunks.map(chunk => getDocs(query(collection(firestore, collectionName), where(documentId(), 'in', chunk)))))
  for (const snapshot of snapshots) for (const item of snapshot.docs) map.set(item.id, item.data())
  return map
}

const hasDetails = (codeDate: CodeDate) => codeDate.productName != null && codeDate.department != null && codeDate.codeDateCheckMonth != null

/**
 * Turns code date records into dashboard rows. Records saved with their product/check details
 * (everything saved after this change, plus anything the one-time upgrade has filled in) need no
 * extra reads at all; only older records fall back to looking up their product and check.
 */
async function joinCodeDates(codeDates: CodeDate[]): Promise<DashboardEntry[]> {
  if (!codeDates.length) return []
  const firestore = database()
  const needLookup = codeDates.filter(item => !hasDetails(item))
  const [products, checks] = await Promise.all([
    getDocsByIds(firestore, 'products', [...new Set(needLookup.map(item => item.productId))]),
    getDocsByIds(firestore, 'codeDateChecks', [...new Set(needLookup.map(item => item.codeDateCheckId))]),
  ])

  return codeDates.map(codeDate => {
    const details = hasDetails(codeDate) ? codeDate : lookedUpDetails(products.get(codeDate.productId), checks.get(codeDate.codeDateCheckId))
    return {
      id: codeDate.id,
      productId: codeDate.productId,
      productName: String(details.productName || 'Unnamed product'),
      description: String(details.description ?? ''),
      upc: String(details.upc ?? ''),
      vendorCode: String(details.vendorCode ?? ''),
      subDepartment: String(details.subDepartment ?? ''),
      imageUrl: typeof details.imageUrl === 'string' && details.imageUrl ? details.imageUrl : undefined,
      expirationDate: codeDate.expirationDate,
      quantity: codeDate.quantity,
      status: codeDate.status,
      recheckAt: codeDate.recheckAt,
      department: String(details.department || 'Unassigned'),
      codeDateCheckId: codeDate.codeDateCheckId,
      codeDateCheckName: String(details.codeDateCheckName ?? ''),
      codeDateCheckMonth: String(details.codeDateCheckMonth ?? ''),
      createdAt: codeDate.createdAt,
    }
  })
}

function lookedUpDetails(product?: Record<string, unknown>, check?: Record<string, unknown>): CodeDateDetails {
  return {
    productName: String(product?.name ?? product?.description ?? 'Unnamed product'),
    description: String(product?.description ?? ''),
    upc: String(product?.upc ?? product?.barcode ?? ''),
    vendorCode: String(product?.vendorCode ?? ''),
    subDepartment: String(product?.subDepartment ?? ''),
    ...(typeof product?.imageUrl === 'string' && product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    department: String(check?.department ?? 'Unassigned'),
    codeDateCheckName: String(check?.name ?? ''),
    codeDateCheckMonth: String(check?.month ?? ''),
  }
}

/**
 * All-time Sold-vs-Removed totals for the dashboard's impact card. Firestore adds these up on its
 * side and sends back four numbers — the previous version downloaded every sold/removed record ever
 * on each dashboard visit, which got slower every week.
 */
export async function getDiversionStats() {
  const codeDates = collection(database(), 'codeDates')
  const totals = { units: sum('quantity'), records: count() }
  const [sold, removed] = await Promise.all([
    getAggregateFromServer(query(codeDates, where('status', '==', 'cleared')), totals),
    getAggregateFromServer(query(codeDates, where('status', '==', 'removed')), totals),
  ])
  return { soldUnits: sold.data().units, soldRecords: sold.data().records, removedUnits: removed.data().units, removedRecords: removed.data().records }
}

/** How many code-date records a check has (Firestore counts them — nothing is downloaded). Used for "38 scanned". */
export async function countCodeDatesForCheck(codeDateCheckId: string) {
  const result = await getAggregateFromServer(query(collection(database(), 'codeDates'), where('codeDateCheckId', '==', codeDateCheckId)), { records: count() })
  return result.data().records
}

/**
 * Records sold or removed since `since`, for the dashboard charts. Filters on `updatedAt` alone (an
 * automatic single-field index, so no new index to deploy) and keeps cleared/removed in the browser.
 * `updatedAt` is stamped when an item is marked Sold/Removed, which is the moment the charts count.
 */
export async function getResolvedSince(since: Date): Promise<DashboardEntry[]> {
  const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('updatedAt', '>=', since)))
  const resolved = snapshot.docs.map(toCodeDate).filter(item => item.status === 'cleared' || item.status === 'removed')
  const entries = await joinCodeDates(resolved)
  const resolvedAt = new Map(snapshot.docs.map(item => [item.id, item.data().updatedAt ? asDate(item.data().updatedAt) : undefined]))
  return entries.map(entry => ({ ...entry, resolvedAt: resolvedAt.get(entry.id) }))
}

/** Dashboard data source. Defaults to the operational view (active + marked_down); pass an explicit status list for the Cleared/Removed filter tabs. */
export async function getDashboardEntries(statuses: ProductStatus[] = ['active', 'marked_down']): Promise<DashboardEntry[]> {
  const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('status', 'in', statuses), orderBy('expirationDate')))
  return joinCodeDates(snapshot.docs.map(toCodeDate))
}

/** All code dates (any status) for one Code Date Check — used by the check-completion summary and the Excel export. */
export async function getCodeDatesForCheck(codeDateCheckId: string): Promise<DashboardEntry[]> {
  const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('codeDateCheckId', '==', codeDateCheckId), orderBy('expirationDate')))
  return joinCodeDates(snapshot.docs.map(toCodeDate))
}

/**
 * One-time upgrade for records saved before details were copied onto them: looks up each old
 * record's product and check once and writes the details back, so every later dashboard load skips
 * those lookups. Safe to run more than once — records that already have details are left alone.
 */
export async function backfillCodeDateDetails(onProgress?: (done: number, total: number) => void) {
  const firestore = database()
  const snapshot = await getDocs(collection(firestore, 'codeDates'))
  const missing = snapshot.docs.map(toCodeDate).filter(item => !hasDetails(item))
  if (!missing.length) return { updated: 0, failed: 0 }
  const [products, checks] = await Promise.all([
    getDocsByIds(firestore, 'products', [...new Set(missing.map(item => item.productId))]),
    getDocsByIds(firestore, 'codeDateChecks', [...new Set(missing.map(item => item.codeDateCheckId))]),
  ])
  let updated = 0, failed = 0
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200)
    const batch = writeBatch(firestore)
    for (const item of chunk) batch.update(doc(firestore, 'codeDates', item.id), { ...lookedUpDetails(products.get(item.productId), checks.get(item.codeDateCheckId)) })
    try { await batch.commit(); updated += chunk.length } catch { failed += chunk.length }
    onProgress?.(updated + failed, missing.length)
  }
  return { updated, failed }
}
