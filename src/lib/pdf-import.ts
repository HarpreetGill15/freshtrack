import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { ImportedProduct } from '../types/domain'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// UPC tokens in the source PDF include dashes/spaces (e.g. "0-12345-67890-1"); this matches that shape.
const UPC_PATTERN = /\b\d[\d\s-]{6,15}\d\b/g
// SAP/vendor codes are the shorter plain numeric run left over on the line after the UPC is removed.
const VENDOR_CODE_PATTERN = /\b\d{4,8}\b/
const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** Reconstructs text lines from a PDF page by grouping text items that share an approximate y-position, left-to-right. */
async function extractLines(page: PDFPageProxy): Promise<string[]> {
  const content = await page.getTextContent()
  const rows = new Map<number, { x: number; text: string }[]>()
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const y = Math.round(item.transform[5])
    const bucketKey = [...rows.keys()].find(existing => Math.abs(existing - y) <= 2) ?? y
    const list = rows.get(bucketKey) ?? []
    list.push({ x: item.transform[4], text: item.str })
    rows.set(bucketKey, list)
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(c => c.text).join(' ').replace(/\s{2,}/g, ' ').trim())
}

/**
 * Best-effort extraction: reads every line of the PDF, and on any line containing a UPC-shaped
 * token, treats the remaining shorter numeric run as the SAP/vendor code and the rest as the description.
 * This is heuristic, not a real table parser — always review the preview before importing.
 */
export async function parsePdfProducts(file: File): Promise<ImportedProduct[]> {
  const buffer = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data: buffer }).promise
  const products: ImportedProduct[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const lines = await extractLines(page)
    for (const line of lines) {
      const upcMatch = [...line.matchAll(UPC_PATTERN)].find(match => digitsOnly(match[0]).length >= 8)
      if (!upcMatch) continue
      const upc = digitsOnly(upcMatch[0])
      const rest = line.replace(upcMatch[0], ' ').trim()
      const vendorMatch = rest.match(VENDOR_CODE_PATTERN)
      const vendorCode = vendorMatch ? vendorMatch[0] : ''
      const description = (vendorMatch ? rest.replace(vendorMatch[0], ' ') : rest).replace(/\s{2,}/g, ' ').trim()
      if (upc && description) products.push({ upc, description, vendorCode, subDepartment: '' })
    }
  }
  return products
}
