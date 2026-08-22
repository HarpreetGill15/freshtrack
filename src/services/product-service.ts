import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type FieldValue } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { normalizeScannedUpc, normalizeUpc } from '../lib/upc'
import type { CodeDate, DashboardEntry, Product, ProductStatus } from '../types/domain'

const database = () => { if (!db) throw new Error('Firebase is not configured.'); return db }
const asDate = (value: unknown) => value && typeof value === 'object' && 'toDate' in value ? (value as { toDate(): Date }).toDate() : new Date(value as string)
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

const normalize = (documentId: string, data: Record<string, unknown>) => ({
  id: documentId,
  ...data,
  name: String(data.name ?? data.description ?? 'Unnamed product'),
  active: data.active !== false,
} as Product)

async function lookupByUpcValue(firestore: ReturnType<typeof database>, upc: string) {
  const direct = await getDoc(doc(firestore, 'products', upc))
  if (direct.exists()) return normalize(direct.id, direct.data())
  const byUpc = await getDocs(query(collection(firestore, 'products'), where('upc', '==', upc)))
  const matches = byUpc.empty ? await getDocs(query(collection(firestore, 'products'), where('barcode', '==', upc))) : byUpc
  return matches.empty ? null : normalize(matches.docs[0].id, matches.docs[0].data())
}

export async function findProductByUpc(rawUpc: string) {
  const canonical = normalizeUpc(rawUpc)
  if (!canonical) return null
  const firestore = database()
  const canonicalMatch = await lookupByUpcValue(firestore, canonical)
  if (canonicalMatch) return canonicalMatch
  // Fallback for products imported/created before UPC normalization was unified to always
  // strip-and-pad to 12 digits — older records may be stored under the raw digit sequence as typed.
  const rawDigits = rawUpc.replace(/\D/g, '')
  if (rawDigits && rawDigits !== canonical) {
    const rawMatch = await lookupByUpcValue(firestore, rawDigits)
    if (rawMatch) return rawMatch
  }
  // Fallback for camera scans of a real UPC-A/EAN-13 barcode: the printed barcode carries a genuine
  // check digit, but the catalogue stores codes without one (11-digit code zero-padded to 12) since
  // that's how they arrive from Excel imports and manual entry. Drop the presumed check digit (the
  // last digit) and re-normalize before giving up.
  const withoutCheckDigit = normalizeScannedUpc(rawDigits)
  if (withoutCheckDigit && withoutCheckDigit !== canonical) return lookupByUpcValue(firestore, withoutCheckDigit)
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
export async function getCodeDates(productId: string) { const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('productId', '==', productId), orderBy('expirationDate'))); return snapshot.docs.map(item => ({ id: item.id, ...item.data(), expirationDate: asDate(item.data().expirationDate) } as CodeDate)) }

/**
 * Adds a code date, or — if an active code date already exists for the same product, the same
 * Code Date Check, and the same calendar day — increases that existing record's quantity instead
 * of creating a duplicate. Checked client-side against the product's (already-indexed) code dates
 * rather than a new Firestore query, since a single product has very few code dates at a time.
 */
export async function addOrIncrementCodeDate(input: Omit<CodeDate, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
  const existingForProduct = await getCodeDates(input.productId)
  const match = existingForProduct.find(item => item.codeDateCheckId === input.codeDateCheckId && item.status === 'active' && sameDay(item.expirationDate, input.expirationDate))
  if (match) {
    await updateDoc(doc(database(), 'codeDates', match.id), { quantity: match.quantity + input.quantity, updatedAt: serverTimestamp() })
    return { merged: true as const, id: match.id, quantity: match.quantity + input.quantity }
  }
  const ref = await addDoc(collection(database(), 'codeDates'), { ...input, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return { merged: false as const, id: ref.id, quantity: input.quantity }
}

export async function setCodeDateStatus(codeDateId: string, status: ProductStatus, recheckAt?: Date) {
  const payload: { status: ProductStatus; updatedAt: FieldValue; markedDownAt?: FieldValue; recheckAt?: Date | null } = { status, updatedAt: serverTimestamp() }
  if (status === 'marked_down') { payload.markedDownAt = serverTimestamp(); payload.recheckAt = recheckAt ?? null }
  await updateDoc(doc(database(), 'codeDates', codeDateId), payload)
}

async function joinCodeDates(codeDates: CodeDate[]): Promise<DashboardEntry[]> {
  if (!codeDates.length) return []
  const firestore = database()
  const productIds = [...new Set(codeDates.map(item => item.productId))]
  const checkIds = [...new Set(codeDates.map(item => item.codeDateCheckId))]
  const [productDocs, checkDocs] = await Promise.all([
    Promise.all(productIds.map(id => getDoc(doc(firestore, 'products', id)))),
    Promise.all(checkIds.map(id => getDoc(doc(firestore, 'codeDateChecks', id)))),
  ])
  const products = new Map(productDocs.filter(item => item.exists()).map(item => [item.id, item.data()]))
  const checks = new Map(checkDocs.filter(item => item.exists()).map(item => [item.id, item.data()]))

  return codeDates.map(codeDate => {
    const product = products.get(codeDate.productId)
    const check = checks.get(codeDate.codeDateCheckId)
    return {
      id: codeDate.id,
      productId: codeDate.productId,
      productName: String(product?.name ?? product?.description ?? 'Unnamed product'),
      description: String(product?.description ?? ''),
      upc: String(product?.upc ?? product?.barcode ?? ''),
      vendorCode: String(product?.vendorCode ?? ''),
      subDepartment: String(product?.subDepartment ?? ''),
      imageUrl: typeof product?.imageUrl === 'string' ? product.imageUrl : undefined,
      expirationDate: codeDate.expirationDate,
      quantity: codeDate.quantity,
      status: codeDate.status,
      recheckAt: codeDate.recheckAt,
      department: String(check?.department ?? 'Unassigned'),
      codeDateCheckId: codeDate.codeDateCheckId,
      codeDateCheckName: String(check?.name ?? ''),
      createdAt: codeDate.createdAt,
    }
  })
}

/** Dashboard data source. Defaults to the operational view (active + marked_down); pass an explicit status list for the Cleared/Removed filter tabs. */
export async function getDashboardEntries(statuses: ProductStatus[] = ['active', 'marked_down']): Promise<DashboardEntry[]> {
  const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('status', 'in', statuses), orderBy('expirationDate')))
  const codeDates = snapshot.docs.map(item => ({ id: item.id, ...item.data(), expirationDate: asDate(item.data().expirationDate), recheckAt: item.data().recheckAt ? asDate(item.data().recheckAt) : undefined, createdAt: item.data().createdAt ? asDate(item.data().createdAt) : undefined } as CodeDate))
  return joinCodeDates(codeDates)
}

/** All code dates (any status) for one Code Date Check — used by the check-completion summary and the Excel export. */
export async function getCodeDatesForCheck(codeDateCheckId: string): Promise<DashboardEntry[]> {
  const snapshot = await getDocs(query(collection(database(), 'codeDates'), where('codeDateCheckId', '==', codeDateCheckId), orderBy('expirationDate')))
  const codeDates = snapshot.docs.map(item => ({ id: item.id, ...item.data(), expirationDate: asDate(item.data().expirationDate), recheckAt: item.data().recheckAt ? asDate(item.data().recheckAt) : undefined, createdAt: item.data().createdAt ? asDate(item.data().createdAt) : undefined } as CodeDate))
  return joinCodeDates(codeDates)
}
