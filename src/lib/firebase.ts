import { initializeApp } from "firebase/app"
import { connectAuthEmulator, getAuth } from "firebase/auth"
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore"

// Public by design — this ships in the bundle (provisioned in #12).
// authDomain is the serving domain, not the default *.firebaseapp.com, so the
// sign-in redirect iframe stays same-origin under third-party-storage blocking
// (#10 Option 1, docs/research/firebase-backend-validation.md § 5).
const firebaseConfig = {
  apiKey: "AIzaSyCwPvXKwYBTQGX4rXOEPLfLjP276WAzn8Y",
  authDomain: "goyaffle.web.app",
  projectId: "goyaffle",
  storageBucket: "goyaffle.firebasestorage.app",
  messagingSenderId: "133375256638",
  appId: "1:133375256638:web:3bbb7bd45b92770d1c496f",
  measurementId: "G-G4KQGQR98X",
}

export const app = initializeApp(firebaseConfig)

// The Firestore SDK *is* the store (ADR 0001): its persistent cache provides
// offline use, queued writes, and LWW reconciliation. The multi-tab manager
// matters because an installed PWA can legitimately open several windows.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

export const auth = getAuth(app)

// Local dev never touches real data (spec § Deploy & environments).
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
  connectFirestoreEmulator(db, "127.0.0.1", 8080)
}
