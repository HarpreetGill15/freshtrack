import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { upsertImportedProducts } from '../services/inventory-service'
import { normalizeUpc } from '../lib/upc'
import type { ImportError, ImportedProduct, ImportTotals } from '../types/domain'

const initialTotals: ImportTotals = { added: 0, updated: 0, unchanged: 0, skipped: 0, processed: 0, total: 0, errors: [] }
// Multiple accepted spellings per column, since real-world company files rarely match one exact header.
// 'product' is included under vendorcode because POS "Product List" reports commonly label an internal
// item/module number that way — 'vendor' is checked first, so an explicit Vendor column still wins if both exist.
const HEADER_CANDIDATES: Record<string, string[]> = {
  upc: ['upc', 'upccode', 'barcode', 'upc/ean', 'ean'],
  description: ['description', 'productdescription', 'productname', 'name', 'desc'],
  vendorcode: ['vendorcode', 'sapcode', 'sap', 'vendor', 'vendoritemcode', 'product', 'productid', 'itemcode'],
  subdepartment: ['subdepartment', 'subdept', 'category', 'department'],
}
const ALL_HEADER_KEYWORDS = new Set(Object.values(HEADER_CANDIDATES).flat())
const normalizeHeaderCell = (cell: unknown) => String(cell ?? '').trim().toLowerCase().replace(/[ _-]/g, '')

/**
 * Real-world exports (especially POS/ERP "Product List" reports) often have several rows of report
 * metadata (title, date, store filters) before the actual header row — assuming row 1 is always the
 * header silently produces zero valid rows on files like that. This scans the first 30 rows and picks
 * whichever one best matches known column-header keywords, instead of assuming a fixed position.
 */
function findHeaderRowIndex(rows: unknown[][]) {
  let bestIndex = 0, bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const score = (rows[i] ?? []).filter(cell => ALL_HEADER_KEYWORDS.has(normalizeHeaderCell(cell))).length
    // >= (not >) prefers the later row on a tie — report layouts put section-group labels above the
    // field-specific header row, so the lower of two equally-scored rows is the more precise one.
    if (score > 0 && score >= bestScore) { bestScore = score; bestIndex = i }
  }
  return bestIndex
}

/** Some exports split the header across two rows (a merged-cell group label above the actual field name). Fills blanks in the detected header row from the row directly above it. */
function buildEffectiveHeaders(rows: unknown[][], headerRowIndex: number) {
  const headerRow = rows[headerRowIndex] ?? []
  const aboveRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] ?? [] : []
  const width = Math.max(headerRow.length, aboveRow.length)
  return Array.from({ length: width }, (_, col) => normalizeHeaderCell(headerRow[col]) || normalizeHeaderCell(aboveRow[col]))
}
function columnIndexFor(headers: string[], field: keyof typeof HEADER_CANDIDATES) {
  for (const candidate of HEADER_CANDIDATES[field]) { const index = headers.indexOf(candidate); if (index !== -1) return index }
  return -1
}
function downloadCsv(filename: string, errors: ImportError[]) {
  const rows = [['Row', 'UPC', 'Reason'], ...errors.map(e => [String(e.row), e.upc, e.reason])]
  const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export function ProductImportPage() {
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [products, setProducts] = useState<ImportedProduct[]>([])
  const [totals, setTotals] = useState(initialTotals)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  async function readSpreadsheet(file: File) {
    // raw:false returns each cell's formatted display text (cell.w) rather than the raw JS value —
    // this is what preserves a Text-formatted UPC column's leading zeros; a Number-formatted column
    // has already lost them at the Excel level, which normalizeUpc then heuristically recovers.
    // header:1 returns raw rows (arrays), not objects keyed by row 1 — needed since the real header
    // row isn't always row 1 (see findHeaderRowIndex).
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const worksheet = book.Sheets[book.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false })

    const headerRowIndex = findHeaderRowIndex(rows)
    const headers = buildEffectiveHeaders(rows, headerRowIndex)
    const upcCol = columnIndexFor(headers, 'upc')
    const descCol = columnIndexFor(headers, 'description')
    const vendorCol = columnIndexFor(headers, 'vendorcode')
    const subDeptCol = columnIndexFor(headers, 'subdepartment')
    const cell = (row: unknown[], col: number) => (col === -1 ? '' : String(row[col] ?? '').trim())

    const dataRows = rows.slice(headerRowIndex + 1)
      .map((row, i) => ({ row, sourceRow: headerRowIndex + 2 + i }))
      .filter(({ row }) => row.some(value => String(value ?? '').trim() !== '')) // skip blank/spacer rows without flagging them as errors

    const mapped: (ImportedProduct & { rowIndex: number })[] = dataRows.map(({ row, sourceRow }) => ({
      upc: normalizeUpc(cell(row, upcCol)),
      description: cell(row, descCol),
      vendorCode: cell(row, vendorCol),
      subDepartment: cell(row, subDeptCol),
      rowIndex: sourceRow,
    }))
    const errors: ImportError[] = mapped.filter(p => !p.upc || !p.description).map(p => ({ row: p.rowIndex, upc: p.upc || '(blank)', reason: !p.upc ? 'Missing or unreadable UPC' : 'Missing Description' }))
    const valid = mapped.filter(p => p.upc && p.description)
    return { valid, errors }
  }

  async function readFile(file: File) {
    setMessage(''); setTotals(initialTotals); setFileName(file.name)
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    try {
      let valid: ImportedProduct[]; let errors: ImportError[]
      if (isPdf) {
        setMessage('Loading PDF reader…')
        const { parsePdfProducts } = await import('../lib/pdf-import')
        valid = await parsePdfProducts(file); errors = []
      } else {
        ;({ valid, errors } = await readSpreadsheet(file))
      }
      setProducts(valid)
      setTotals({ ...initialTotals, total: valid.length, skipped: errors.length, errors })
      setMessage(valid.length
        ? `${valid.length} products found. Review the preview below before importing${isPdf ? ' — PDF extraction is best-effort, so double-check a few rows' : ''}.`
        : isPdf ? 'No UPC-shaped values found in the PDF text.' : 'No valid products found. Confirm the UPC and Description columns.')
    } catch { setProducts([]); setMessage(isPdf ? 'The PDF could not be read.' : 'The file could not be read. Upload a valid .xls, .xlsx, or .csv file.') }
  }

  async function importFile() {
    if (!products.length) return
    setImporting(true); setMessage('Importing products…')
    const preExistingErrors = totals.errors
    try {
      const result = await upsertImportedProducts(products, progress => setTotals({ ...progress, skipped: progress.skipped + preExistingErrors.length, errors: [...preExistingErrors, ...progress.errors] }))
      setTotals({ ...result, skipped: result.skipped + preExistingErrors.length, errors: [...preExistingErrors, ...result.errors] })
      setMessage('Import complete.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed. Please try again.') }
    finally { setImporting(false) }
  }

  const percentage = totals.total ? Math.round((totals.processed / totals.total) * 100) : 0
  return <AppShell><h2 className="text-2xl font-bold">Product import</h2><p className="mt-1 text-sm text-slate-500">Import your master product catalogue from Excel or PDF.</p>
    <section className="mt-7 rounded-2xl bg-white p-5 shadow-card"><input ref={input} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={event => event.target.files?.[0] && void readFile(event.target.files[0])}/><div className="rounded-2xl border-2 border-dashed border-brand-100 bg-brand-50 p-7 text-center"><FileSpreadsheet className="mx-auto text-brand-600" size={34}/><p className="mt-3 font-semibold">Upload a product file</p><p className="mt-1 text-sm text-slate-500">Accepts .xls, .xlsx, .csv, or .pdf. Required: UPC and Description. Vendor/SAP code and Sub Department are optional.</p><Button className="mt-5" variant="secondary" onClick={() => input.current?.click()} disabled={importing}><UploadCloud size={17} className="mr-2"/>Choose file</Button></div>{fileName && <p className="mt-4 text-sm font-medium text-slate-700">Selected: {fileName}</p>}{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}</section>
    {!!products.length && !importing && <section className="mt-5 rounded-2xl bg-white p-5 shadow-card"><h3 className="font-bold">Preview — check a few rows before importing</h3><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{products.slice(0, 25).map((p, i) => <div key={`${p.upc}-${i}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="min-w-0 truncate">{p.description}</span><span className="shrink-0 font-mono text-xs text-slate-500">UPC {p.upc}{p.vendorCode ? ` · SAP ${p.vendorCode}` : ''}</span></div>)}</div>{products.length > 25 && <p className="mt-2 text-center text-xs text-slate-500">+{products.length - 25} more not shown</p>}</section>}
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-card">
      <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-5">
        <Metric label="Added" value={totals.added} color="text-brand-600"/>
        <Metric label="Updated" value={totals.updated} color="text-blue-600"/>
        <Metric label="Unchanged" value={totals.unchanged} color="text-slate-500"/>
        <Metric label="Skipped" value={totals.skipped} color="text-amber-600"/>
        <Metric label="Errors" value={totals.errors.length} color="text-red-600"/>
      </div>
      {importing && <div className="mt-5"><div className="mb-2 flex justify-between text-sm"><span>Importing {totals.processed} of {totals.total}</span><span>{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${percentage}%` }}/></div></div>}
      {!!totals.errors.length && !importing && <Button variant="secondary" className="mt-5 w-full" onClick={() => downloadCsv('freshtrack-import-errors.csv', totals.errors)}><Download size={17} className="mr-2"/>Download error report ({totals.errors.length})</Button>}
      <Button className="mt-3 w-full" disabled={!products.length || importing} onClick={() => void importFile()}>{importing ? 'Importing…' : `Import ${products.length} products`}</Button>
    </section>
  </AppShell>
}
function Metric({ label, value, color }: { label: string; value: number; color: string }) { return <div><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div> }
