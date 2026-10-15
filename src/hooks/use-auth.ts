import { useEffect, useState } from 'react'
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth } from 'firebase/auth'
import { app } from '../lib/firebase'

// Manager sign-in uses Firebase Authentication's free email/password sign-in — no server code or
// Vercel settings. The manager account is created once in Firebase Console (see DEPLOYMENT.md).
// The real password lives only in Firebase, never in this code.
//
// Staff type a short username ("h") and password ("928"). Firebase needs an email address and a
// password of at least 6 characters, so both are expanded the same way here and when the account
// is created: "h" → "h@freshtrack.local", "928" → "928-freshtrack". firestore.rules only lets that
// exact email delete checks.
export const ADMIN_EMAIL_DOMAIN = 'freshtrack.local'
const PASSWORD_SUFFIX = '-freshtrack'
export const toAdminEmail = (username: string) => `${username.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`
const toFirebasePassword = (password: string) => `${password}${PASSWORD_SUFFIX}`

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
      await persistenceReady
      try {
        await signInWithEmailAndPassword(auth, toAdminEmail(username), toFirebasePassword(password))
      } catch (reason) {
        const code = (reason as { code?: string }).code ?? ''
        if (code === 'auth/too-many-requests') throw new Error('Too many tries. Wait a few minutes and try again.')
        if (code === 'auth/network-request-failed') throw new Error('No connection. Check the wifi and try again.')
        if (code === 'auth/operation-not-allowed') throw new Error('Sign-in is not turned on yet (Firebase Console → Authentication → Sign-in method → Email/Password).')
        throw new Error('Incorrect username or password.')
      }
      setLocalAdmin(true)
    },
    signOut: async () => { if (auth) await firebaseSignOut(auth); setLocalAdmin(false) },
  }
}
