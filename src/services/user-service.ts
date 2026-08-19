import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../lib/firebase'

/** Creates/refreshes the minimal employee profile used by FreshTrack. */
export async function upsertUserProfile(user: User) {
  if (!db) return
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    lastLoginAt: serverTimestamp(),
  }, { merge: true })
}
