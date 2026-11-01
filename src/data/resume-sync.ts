// Fresh server connection on the way back to the foreground. A phone that had
// the app in the background for a while can hand it back with a listen stream
// that died without the SDK noticing (the OS dropped the socket, a NAT timed
// out). The SDK reconnects at once when the stream *errors*, but a silently
// dead one can hold the log on stale data — the PC's latest Entry not
// arriving — until something finally fails. Cycling the network after a real
// absence guarantees one fresh handshake: the listeners re-attach with their
// resume tokens (only changed documents are read), queued writes flush, and
// the Day's snapshot reports fromCache until the server has confirmed it, which
// is exactly what drives the faint spinner under the log.
import {
  disableNetwork,
  enableNetwork,
  type Firestore,
} from "firebase/firestore"

/**
 * How long the app must have been hidden before a return cycles the network.
 * A quick app switch keeps its stream, which is almost certainly still alive;
 * past this, a stale socket is plausible and one handshake is cheap.
 */
export const RESUME_REFRESH_AFTER_MS = 30_000

/** The page and clock this watches — injectable for tests. */
export interface ResumeEnv {
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >
  isOnline: () => boolean
  now: () => number
}

function browserEnv(): ResumeEnv | null {
  if (typeof document === "undefined") return null
  return {
    document,
    isOnline: () => navigator.onLine,
    now: () => Date.now(),
  }
}

/**
 * Cycle Firestore's network whenever the app returns to the foreground after
 * at least `afterMs` hidden, with a connection to reconnect over. Offline,
 * there's nothing to refresh — the SDK picks the stream back up on its own
 * when the browser reports `online`.
 */
export function refreshOnResume(
  db: Firestore,
  env: ResumeEnv | null = browserEnv(),
  afterMs: number = RESUME_REFRESH_AFTER_MS
): () => void {
  if (!env) return () => {}
  let hiddenAt: number | null = null
  const onChange = () => {
    if (env.document.visibilityState === "hidden") {
      hiddenAt = env.now()
      return
    }
    if (hiddenAt === null) return
    const away = env.now() - hiddenAt
    hiddenAt = null
    if (away < afterMs || !env.isOnline()) return
    disableNetwork(db)
      .then(() => enableNetwork(db))
      .catch((err) => console.error("Resume reconnect failed", err))
  }
  env.document.addEventListener("visibilitychange", onChange)
  return () => env.document.removeEventListener("visibilitychange", onChange)
}
