import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/home-page'

// Sign-in code (Firebase Auth) is only needed for the back-office pages, so it isn't part of the first download either.
const ProtectedRoute = lazy(async () => ({ default: (await import('./components/protected-route')).ProtectedRoute }))

// Each page's code (and its heavy libraries — Excel, the barcode reader, the import parsers) is
// downloaded only when someone opens that page, so the first screen loads quickly on store wifi.
// The service worker still precaches all of them in the background for offline use.
const LoginPage = lazy(async () => ({ default: (await import('./pages/login-page')).LoginPage }))
const NewCodeDateCheckPage = lazy(async () => ({ default: (await import('./pages/new-code-date-check-page')).NewCodeDateCheckPage }))
const CheckFinishPage = lazy(async () => ({ default: (await import('./pages/check-finish-page')).CheckFinishPage }))
const ScanPage = lazy(async () => ({ default: (await import('./pages/scan-page')).ScanPage }))
const ProductDetailsPage = lazy(async () => ({ default: (await import('./pages/product-details-page')).ProductDetailsPage }))
const HelpPage = lazy(async () => ({ default: (await import('./pages/help-page')).HelpPage }))
const DashboardPage = lazy(async () => ({ default: (await import('./pages/dashboard-page')).DashboardPage }))
const ChecksListPage = lazy(async () => ({ default: (await import('./pages/checks-list-page')).ChecksListPage }))
const ProductImportPage = lazy(async () => ({ default: (await import('./pages/product-import-page')).ProductImportPage }))
const SettingsPage = lazy(async () => ({ default: (await import('./pages/settings-page')).SettingsPage }))

export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-slate-500">Loading…</p>}>
      <Routes>
        {/* Public entry point and the full Code Date Check workflow require no authentication. */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/checks/new" element={<NewCodeDateCheckPage />} />
        <Route path="/checks/finish" element={<CheckFinishPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/products/:productId" element={<ProductDetailsPage />} />
        <Route path="/help" element={<HelpPage />} />

        {/* Back-office views remain gated behind sign-in. */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/checks" element={<ProtectedRoute><ChecksListPage /></ProtectedRoute>} />
        <Route path="/product-import" element={<ProtectedRoute><ProductImportPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
