import { useEffect, useState } from 'react'
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User } from 'firebase/auth'
import { app } from '../lib/firebase'

// Two logins, both free Firebase email/password accounts created once in Firebase Console (see
// DEPLOYMENT.md). The passwords live only in Firebase, never in this code.
//   928 / 928 — staff: delete checks, import products, settings
//   h   / 928 — manager: all of that, plus the charts Dashboard
// Scanning and the To-do list need no login at all.
//
// Firebase needs an email address and a password of at least 6 characters, so what staff type is
// expanded the same way here and when the accounts are created: "928" → "928@freshtrack.local",
// password "928" → "928-freshtrack". firestore.rules only lets these two emails delete.
const EMAIL_DOMAIN = 'freshtrack.local'
const PASSWORD_SUFFIX = '-freshtrack'
const MANAGER_EMAILS = ['h@freshtrack.local']
const toEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
const toFirebasePassword = (password: string) => `${password}${PASSWORD_SUFFIX}`

export type Role = 'staff' | 'manager'
const roleFor = (user: User | null | undefined): Role | null => !user ? null : MANAGER_EMAILS.includes(user.email ?? '') ? 'manager' : 'staff'

// Session persistence matches the old behaviour: closing the tab signs you out.
const auth: Auth | undefined = app ? getAuth(app) : undefined
const persistenceReady = auth ? setPersistence(auth, browserSessionPersistence).catch(() => undefined) : Promise.resolve()

export function useAuth() {
  const [role, setRole] = useState<Role | null>(() => roleFor(auth?.currentUser))
  const [loading, setLoading] = useState<boolean>(() => Boolean(auth && !auth.currentUser))

  useEffect(() => {
    if (!auth) { setLoading(false); return }
    return onAuthStateChanged(auth, user => { setRole(roleFor(user)); setLoading(false) })
  }, [])

  return {
    role,
    /** Signed in with either login (staff or manager). */
    localAdmin: role != null,
    isManager: role === 'manager',
    loading,
    signIn: async (username: string, password: string) => {
      if (!auth) throw new Error('Firebase is not configured.')
      await persistenceReady
      try {
        const credential = await signInWithEmailAndPassword(auth, toEmail(username), toFirebasePassword(password))
        const next = roleFor(credential.user)
        setRole(next)
        return next
      } catch (reason) {
        const code = (reason as { code?: string }).code ?? ''
        if (code === 'auth/too-many-requests') throw new Error('Too many tries. Wait a few minutes and try again.')
        if (code === 'auth/network-request-failed') throw new Error('No connection. Check the wifi and try again.')
        if (code === 'auth/operation-not-allowed') throw new Error('Sign-in is not turned on yet (Firebase Console → Authentication → Sign-in method → Email/Password).')
        throw new Error('Incorrect username or password.')
      }
    },
    signOut: async () => { if (auth) await firebaseSignOut(auth); setRole(null) },
  }
}
