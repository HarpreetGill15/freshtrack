import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
export const app: FirebaseApp | undefined = firebaseConfigured ? initializeApp(firebaseConfig) : undefined

// Offline persistence: queued writes survive spotty grocery-floor wifi and sync automatically on reconnect.
// Falls back to an in-memory-only Firestore instance (still functional, just without offline queueing)
// if persistence can't be enabled (e.g. private browsing, or already open in another unsupported context).
export const db = app
  ? (() => {
      try {
        return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
      } catch {
        return initializeFirestore(app, {})
      }
    })()
  : undefined
