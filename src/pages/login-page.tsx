import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { useAuth } from '../hooks/use-auth'

export function LoginPage() {
  const { role, signIn, signOut } = useAuth(); const navigate = useNavigate(); const location = useLocation()
  const state = location.state as { from?: string; manager?: boolean } | null
  const needsManager = Boolean(state?.manager)
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)

  // Already signed in with a login that's good enough for where they were going.
  if (role === 'manager' || (role === 'staff' && !needsManager)) return <Navigate to={state?.from ?? '/more'} replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (role) await signOut()
      const next = await signIn(username, password)
      if (needsManager && next !== 'manager') { setError('The charts need the manager login.'); return }
      navigate(state?.from ?? '/more', { replace: true })
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Incorrect username or password.') }
    finally { setBusy(false) }
  }

  return <main className="grid min-h-screen place-items-center bg-ground p-5">
    <form onSubmit={event => void submit(event)} className="w-full max-w-sm rounded-3xl bg-white p-7">
      <div className="mb-7">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 font-display text-xl font-extrabold text-white">F</div>
        <h1 className="text-2xl font-extrabold">{needsManager ? 'Manager sign in' : 'Sign in'}</h1>
        <p className="mt-1 text-muted">{needsManager ? 'The charts are for managers.' : 'Needed to delete checks, import products, or change settings.'}</p>
      </div>
      <label className="block font-bold">Username<input className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-line px-3 font-normal" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoFocus required /></label>
      <label className="mt-4 block font-bold">Password<input className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-line px-3 font-normal" type="password" inputMode="numeric" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className="mt-3 font-bold text-overdue">{error}</p>}
      <Button className="mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      <Button type="button" variant="secondary" className="mt-2.5 w-full" onClick={() => navigate('/')}>Back</Button>
    </form>
  </main>
}
