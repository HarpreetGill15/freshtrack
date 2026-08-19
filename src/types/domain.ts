export type ProductStatus = 'active' | 'marked_down' | 'cleared' | 'removed'

export interface Product {
  id: string
  barcode: string
  upc: string
  name: string
  description?: string
  vendorCode?: string
  subDepartment?: string
  brand?: string
  imageUrl?: string
  active: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface CodeDate {
  id: string
  productId: string
  codeDateCheckId: string
  expirationDate: Date
  quantity: number
  status: ProductStatus
  markedDownAt?: Date
  recheckAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export type CodeDateCheckStatus = 'active' | 'completed'
export interface CodeDateCheck {
  id: string
  name: string
  department: string
  section: string
  month: string
  checkDate: string
  status: CodeDateCheckStatus
  createdAt?: Date
  completedAt?: Date
}

/** Joined view of a code date with its product and originating check, used by the Dashboard and Excel export. */
export interface DashboardEntry {
  id: string
  productId: string
  productName: string
  description: string
  upc: string
  vendorCode: string
  subDepartment: string
  imageUrl?: string
  expirationDate: Date
  quantity: number
  status: ProductStatus
  recheckAt?: Date
  department: string
  section: string
  codeDateCheckId: string
  codeDateCheckName: string
  createdAt?: Date
}

export interface ImportedProduct { upc: string; description: string; vendorCode?: string; subDepartment?: string }
export interface ImportError { row: number; upc: string; reason: string }
export interface ImportTotals { added: number; updated: number; unchanged: number; skipped: number; processed: number; total: number; errors: ImportError[] }
