import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { localAdmin, loading } = useAuth()
  const location = useLocation()
  // Firebase restores a session asynchronously — wait for it instead of bouncing a signed-in user to /login.
  if (loading) return <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
  if (!localAdmin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
