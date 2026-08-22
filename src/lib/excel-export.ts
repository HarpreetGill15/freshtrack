import * as XLSX from 'xlsx'
import type { CodeDateCheck, DashboardEntry } from '../types/domain'

const COLUMNS = ['UPC', 'Description', 'Expiring Date'] as const

export function buildCheckWorkbook(check: CodeDateCheck, entries: DashboardEntry[]) {
  const sorted = [...entries].sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime() || a.productName.localeCompare(b.productName))
  const rows = sorted.map(entry => [
    entry.upc,
    entry.description || entry.productName,
    entry.expirationDate.toLocaleDateString('en-CA'),
  ])

  const worksheet = XLSX.utils.aoa_to_sheet([[...COLUMNS], ...rows])
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
  worksheet['!cols'] = COLUMNS.map((header, columnIndex) => {
    const longest = Math.max(header.length, ...rows.map(row => String(row[columnIndex] ?? '').length))
    return { wch: Math.min(Math.max(longest + 2, 10), 40) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Code Date Check')
  return workbook
}

export function checkExportFilename(check: CodeDateCheck) {
  const safeName = (check.name.trim() || check.department).replace(/\s+/g, '_').replace(/[^\w-]/g, '')
  return `${safeName}_Code_Date_Check_${check.checkDate}.xlsx`
}

export function downloadCheckExport(check: CodeDateCheck, entries: DashboardEntry[]) {
  XLSX.writeFile(buildCheckWorkbook(check, entries), checkExportFilename(check))
}
