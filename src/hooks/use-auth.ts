import { useState } from 'react'

// Simple, explicit local gate for the back-office views (Dashboard, Product Import, Settings) --
// not a real authentication system. This is a deliberate choice for the current MVP, not an
// oversight: see PROJECT_STATUS.md for the tradeoff. Nothing sensitive is protected by this beyond
// keeping casual visitors off the admin screens; Firestore access itself is governed entirely by
// firestore.rules, independent of this flag.
const LOCAL_ADMIN_KEY = 'freshtrack-local-admin'
const isStoredLocalAdmin = () => typeof window !== 'undefined' && window.sessionStorage.getItem(LOCAL_ADMIN_KEY) === 'true'

export function useAuth() {
  const [localAdmin, setLocalAdmin] = useState(isStoredLocalAdmin)
  return {
    localAdmin,
    loading: false,
    signIn: (username: string, password: string) => {
      if (username !== '928' || password !== '928') throw new Error('Invalid credentials.')
      window.sessionStorage.setItem(LOCAL_ADMIN_KEY, 'true')
      setLocalAdmin(true)
    },
    signOut: () => { window.sessionStorage.removeItem(LOCAL_ADMIN_KEY); setLocalAdmin(false) },
  }
}
