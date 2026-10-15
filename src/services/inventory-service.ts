import { collection, doc, documentId, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { db, firebaseNotConfiguredMessage } from '../lib/firebase'
import type { ImportTotals, ImportedProduct } from '../types/domain'
const requiredDb = () => { if (!db) throw new Error(firebaseNotConfiguredMessage); return db }

// Rows are compared and written 300 at a time: existing products are read with batched
// `documentId() in [...]` queries (30 IDs each, run in parallel) and changes go out as one batched
// write per chunk — instead of a separate read and write for every row, one row after another,
// which made large catalogue imports crawl.
const CHUNK_SIZE = 300

/**
 * Adds/updates the product catalogue from an import file. Uses the UPC itself as the Firestore
 * document ID (matching the scan-path's saveScannedProduct), so "match by UPC" is structurally
 * impossible to duplicate. Never deletes a product just because it's missing from a newer file.
 */
export async function upsertImportedProducts(products: ImportedProduct[], onProgress: (totals: ImportTotals) => void): Promise<ImportTotals> {
  const database = requiredDb()
  const totals: ImportTotals = { added: 0, updated: 0, unchanged: 0, skipped: 0, processed: 0, total: products.length, errors: [] }
  const report = () => onProgress({ ...totals, errors: [...totals.errors] })

  for (let start = 0; start < products.length; start += CHUNK_SIZE) {
    const chunk = products.slice(start, start + CHUNK_SIZE).map((product, offset) => ({ product, row: start + offset + 2 }))
    const valid = chunk.filter(({ product, row }) => {
      if (product.upc && product.description) return true
      totals.skipped++; totals.processed++
      totals.errors.push({ row, upc: product.upc || '(blank)', reason: 'Missing required UPC or Description' })
      return false
    })

    // The same UPC twice in one file: the later row wins, matching the old row-by-row behaviour.
    const latestByUpc = new Map(valid.map(entry => [entry.product.upc, entry]))
    const duplicates = valid.filter(entry => latestByUpc.get(entry.product.upc) !== entry)
    totals.unchanged += duplicates.length; totals.processed += duplicates.length

    let existing: Map<string, Record<string, unknown>>
    try { existing = await getExisting(database, [...latestByUpc.keys()]) }
    catch (reason) { failRows([...latestByUpc.values()], totals, reason); report(); continue }

    const writes: { upc: string; row: number; data: Record<string, unknown>; kind: 'added' | 'updated' }[] = []
    for (const { product, row } of latestByUpc.values()) {
      const payload = { upc: product.upc, barcode: product.upc, name: product.description, description: product.description, vendorCode: product.vendorCode ?? '', subDepartment: product.subDepartment ?? '', active: true, updatedAt: serverTimestamp() }
      const current = existing.get(product.upc)
      if (!current) { writes.push({ upc: product.upc, row, data: { ...payload, createdAt: serverTimestamp() }, kind: 'added' }); continue }
      const unchanged = current.description === payload.description && (current.vendorCode ?? '') === payload.vendorCode && (current.subDepartment ?? '') === payload.subDepartment
      if (unchanged) { totals.unchanged++; totals.processed++ } else writes.push({ upc: product.upc, row, data: payload, kind: 'updated' })
    }

    if (writes.length) {
      try {
        const batch = writeBatch(database)
        for (const write of writes) batch.set(doc(database, 'products', write.upc), write.data, { merge: true })
        await batch.commit()
        for (const write of writes) { totals[write.kind]++; totals.processed++ }
      } catch {
        // A rejected batch is all-or-nothing — retry its rows one at a time so the error report still names the exact rows that failed.
        for (const write of writes) {
          try { await setDoc(doc(database, 'products', write.upc), write.data, { merge: true }); totals[write.kind]++ }
          catch (reason) { totals.skipped++; totals.errors.push({ row: write.row, upc: write.upc, reason: reason instanceof Error ? reason.message : 'Unknown error' }) }
          finally { totals.processed++ }
        }
      }
    }
    report()
  }
  report()
  return totals
}

async function getExisting(database: ReturnType<typeof requiredDb>, upcs: string[]) {
  const map = new Map<string, Record<string, unknown>>()
  const slices: string[][] = []
  for (let i = 0; i < upcs.length; i += 30) slices.push(upcs.slice(i, i + 30))
  const snapshots = await Promise.all(slices.map(slice => getDocs(query(collection(database, 'products'), where(documentId(), 'in', slice)))))
  for (const snapshot of snapshots) for (const item of snapshot.docs) map.set(item.id, item.data())
  return map
}

function failRows(entries: { product: ImportedProduct; row: number }[], totals: ImportTotals, reason: unknown) {
  for (const { product, row } of entries) {
    totals.skipped++; totals.processed++
    totals.errors.push({ row, upc: product.upc, reason: reason instanceof Error ? reason.message : 'Could not read existing products' })
  }
}
