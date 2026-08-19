import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { localAdmin } = useAuth()
  const location = useLocation()
  if (!localAdmin) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
