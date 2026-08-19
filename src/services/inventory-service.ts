import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ImportTotals, ImportedProduct } from '../types/domain'
const requiredDb = () => { if (!db) throw new Error('Firebase is not configured. Add your VITE_FIREBASE_* variables.'); return db }

/**
 * Adds/updates the product catalogue from an import file. Uses the UPC itself as the Firestore
 * document ID (matching the scan-path's saveScannedProduct) rather than a query-then-write pattern —
 * this makes "match by UPC" atomic and structurally impossible to duplicate, even under concurrent imports.
 * Never deletes a product just because it's missing from a newer file.
 */
export async function upsertImportedProducts(products: ImportedProduct[], onProgress: (totals: ImportTotals) => void): Promise<ImportTotals> {
  const database = requiredDb()
  const totals: ImportTotals = { added: 0, updated: 0, unchanged: 0, skipped: 0, processed: 0, total: products.length, errors: [] }
  for (let index = 0; index < products.length; index++) {
    const product = products[index]
    try {
      if (!product.upc || !product.description) {
        totals.skipped++
        totals.errors.push({ row: index + 2, upc: product.upc || '(blank)', reason: 'Missing required UPC or Description' })
        continue
      }
      const ref = doc(database, 'products', product.upc)
      const existing = await getDoc(ref)
      const payload = { upc: product.upc, barcode: product.upc, name: product.description, description: product.description, vendorCode: product.vendorCode ?? '', subDepartment: product.subDepartment ?? '', active: true, updatedAt: serverTimestamp() }
      if (!existing.exists()) {
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
        totals.added++
      } else {
        const current = existing.data()
        const unchanged = current.description === payload.description && (current.vendorCode ?? '') === payload.vendorCode && (current.subDepartment ?? '') === payload.subDepartment
        if (unchanged) { totals.unchanged++ } else { await setDoc(ref, payload, { merge: true }); totals.updated++ }
      }
    } catch (reason) {
      totals.skipped++
      totals.errors.push({ row: index + 2, upc: product.upc, reason: reason instanceof Error ? reason.message : 'Unknown error' })
    } finally {
      totals.processed++
      onProgress({ ...totals, errors: [...totals.errors] })
    }
  }
  return totals
}
