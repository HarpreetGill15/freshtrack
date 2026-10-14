import { useEffect, useState } from 'react'
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithCustomToken, signOut as firebaseSignOut, type Auth } from 'firebase/auth'
import { app } from '../lib/firebase'

// Back-office sign-in. Credentials are checked server-side by /api/login (stored only in Vercel env
// vars), which returns a Firebase custom token with an `admin` claim. Firestore rules require that
// claim to delete checks, so the gate is enforced by the database — not just hidden in the UI.
// Session persistence matches the old behaviour: closing the tab signs you out.
const auth: Auth | undefined = app ? getAuth(app) : undefined
const persistenceReady = auth ? setPersistence(auth, browserSessionPersistence).catch(() => undefined) : Promise.resolve()

export function useAuth() {
  const [localAdmin, setLocalAdmin] = useState<boolean>(() => Boolean(auth?.currentUser))
  const [loading, setLoading] = useState<boolean>(() => Boolean(auth && !auth.currentUser))

  useEffect(() => {
    if (!auth) { setLoading(false); return }
    return onAuthStateChanged(auth, user => { setLocalAdmin(Boolean(user)); setLoading(false) })
  }, [])

  return {
    localAdmin,
    loading,
    signIn: async (username: string, password: string) => {
      if (!auth) throw new Error('Firebase is not configured.')
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await response.json().catch(() => ({})) as { token?: string; error?: string }
      if (!response.ok || !data.token) throw new Error(data.error ?? 'Incorrect username or password.')
      await persistenceReady
      await signInWithCustomToken(auth, data.token)
      setLocalAdmin(true)
    },
    signOut: async () => { if (auth) await firebaseSignOut(auth); setLocalAdmin(false) },
  }
}
