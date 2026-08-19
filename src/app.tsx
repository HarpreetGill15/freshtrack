import { Navigate, Route, Routes } from 'react-router-dom'
import { CheckFinishPage } from './pages/check-finish-page'
import { ChecksListPage } from './pages/checks-list-page'
import { DashboardPage } from './pages/dashboard-page'
import { HomePage } from './pages/home-page'
import { LoginPage } from './pages/login-page'
import { ScanPage } from './pages/scan-page'
import { SettingsPage } from './pages/settings-page'
import { ProtectedRoute } from './components/protected-route'
import { ProductImportPage } from './pages/product-import-page'
import { ProductDetailsPage } from './pages/product-details-page'
import { NewCodeDateCheckPage } from './pages/new-code-date-check-page'

export default function App() {
  return (
    <Routes>
      {/* Public entry point and the full Code Date Check workflow require no authentication. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/checks/new" element={<NewCodeDateCheckPage />} />
      <Route path="/checks/finish" element={<CheckFinishPage />} />
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/products/:productId" element={<ProductDetailsPage />} />

      {/* Back-office views remain gated behind sign-in. */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/checks" element={<ProtectedRoute><ChecksListPage /></ProtectedRoute>} />
      <Route path="/product-import" element={<ProtectedRoute><ProductImportPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
