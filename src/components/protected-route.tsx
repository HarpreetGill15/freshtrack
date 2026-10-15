import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/use-auth'

/** `manager` pages (the charts Dashboard) need the h login; the rest accept either login. */
export function ProtectedRoute({ children, manager = false }: { children: ReactNode; manager?: boolean }) {
  const { role, loading } = useAuth()
  const location = useLocation()
  // Firebase restores a session asynchronously — wait for it instead of bouncing a signed-in user to /login.
  if (loading) return <p className="p-8 text-center text-sm text-muted">Loading…</p>
  const allowed = manager ? role === 'manager' : role != null
  if (!allowed) return <Navigate to="/login" replace state={{ from: location.pathname + location.search, manager }} />
  return <>{children}</>
}
