import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Firebase web settings. These are NOT secrets — every visitor's browser downloads them, and
// Firebase's own setup guide puts them in the code. What protects the data is firestore.rules.
// They're written here so every build (live and preview) always has them; a VITE_FIREBASE_*
// setting in Vercel still takes priority if one is set.
const DEFAULT_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyAp07R2v9fFSFOzPI38BYw6xh-r5torRsA',
  authDomain: 'freshtrack-590fc.firebaseapp.com',
  projectId: 'freshtrack-590fc',
  storageBucket: 'freshtrack-590fc.firebasestorage.app',
  messagingSenderId: '541838096630',
  appId: '1:541838096630:web:780173f84d9348c204d4d7',
}

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
}

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

/** Names (never values) of the Vercel settings that were empty when this version was built — shown in the error so it's clear which one to fix. */
const missingSettings = Object.entries({
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
}).filter(([, value]) => !value).map(([name]) => name)
export const firebaseNotConfiguredMessage = `Firebase is not configured — this version was built without: ${missingSettings.join(', ') || 'none (settings present)'}.`
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
