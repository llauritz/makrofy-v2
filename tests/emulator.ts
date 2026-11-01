// Connects a real client-SDK app to the running Emulator Suite.
// `firebase emulators:exec` provides the host:port env vars.
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app"
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth"
import {
  connectFirestoreEmulator,
  initializeFirestore,
  onSnapshot,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase/firestore"

const PROJECT_ID = "goyaffle"

function emulatorHost(envVar: string, fallback: string): { host: string; port: number } {
  const raw = process.env[envVar] ?? fallback
  const [host, port] = raw.split(":")
  return { host, port: Number(port) }
}

let appCount = 0

export interface EmulatorApp {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

export function createEmulatorApp(): EmulatorApp {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: "fake-api-key" },
    `test-${++appCount}`,
  )
  const auth = getAuth(app)
  const authHost = emulatorHost("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
  connectAuthEmulator(auth, `http://${authHost.host}:${authHost.port}`, {
    disableWarnings: true,
  })
  const db = initializeFirestore(app, {})
  const fsHost = emulatorHost("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
  connectFirestoreEmulator(db, fsHost.host, fsHost.port)
  return { app, auth, db }
}

export async function destroyEmulatorApp({ app }: EmulatorApp): Promise<void> {
  await deleteApp(app)
}

/** Poll until `get` returns a value; listeners push state, tests pull it here. */
export async function waitFor<T>(
  get: () => T | undefined,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = get()
    if (value !== undefined) return value
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out")
    await new Promise((r) => setTimeout(r, 25))
  }
}

/** Wipe all Firestore data for the project between tests. */
export async function clearFirestoreData(): Promise<void> {
  const { host, port } = emulatorHost("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
  const res = await fetch(
    `http://${host}:${port}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  )
  if (!res.ok) throw new Error(`clearFirestoreData failed: ${res.status}`)
}

/**
 * Resolve once the server has confirmed `target` — a query or document some
 * listener under test already holds (identical targets share one server
 * stream, so this listener's confirmation is theirs too).
 *
 * Why tests need it: the Firestore emulator can answer a listen target that is
 * still being added with a snapshot taken *before* a write that is in flight
 * at the same moment, and the client then keeps that stale "missing" view
 * even after the write is acknowledged. A test that writes the instant its
 * listeners start (straight after sign-in) hits this on a loaded CI runner;
 * writing only once the targets are current avoids it.
 */
export function serverCurrent(
  target: DocumentReference | Query,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error("serverCurrent timed out"))
    }, timeoutMs)
    const onMeta = (snap: { metadata: { fromCache: boolean } }) => {
      if (snap.metadata.fromCache) return
      clearTimeout(timer)
      queueMicrotask(() => stop())
      resolve()
    }
    const stop =
      "type" in target && target.type === "document"
        ? onSnapshot(target as DocumentReference, { includeMetadataChanges: true }, onMeta, reject)
        : onSnapshot(target as Query, { includeMetadataChanges: true }, onMeta, reject)
  })
}
