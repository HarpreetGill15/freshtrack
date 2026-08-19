import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { useAuth } from '../hooks/use-auth'

export function LoginPage() {
  const { localAdmin, signIn } = useAuth(); const navigate = useNavigate(); const location = useLocation()
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (localAdmin) return <Navigate to="/dashboard" replace />
  function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { signIn(username, password); const destination = (location.state as { from?: string } | null)?.from ?? '/dashboard'; navigate(destination, { replace: true }) }
    catch { setError('Incorrect username or password.') }
    finally { setBusy(false) }
  }
  return <main className="grid min-h-screen place-items-center bg-brand-50 p-5"><form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-card"><div className="mb-7"><div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-xl font-black text-white">F</div><h1 className="text-2xl font-bold">Welcome to FreshTrack</h1><p className="mt-1 text-sm text-slate-500">Sign in to the store dashboard.</p></div><label className="block text-sm font-medium">Username<input className="mt-1 w-full rounded-xl border p-3" value={username} onChange={e => setUsername(e.target.value)} autoFocus required /></label><label className="mt-4 block text-sm font-medium">Password<input className="mt-1 w-full rounded-xl border p-3" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<Button className="mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></form></main>
}
