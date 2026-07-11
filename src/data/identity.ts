import { signInAnonymously, type Auth, type User } from "firebase/auth"

const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000

// Transient failures worth retrying silently; anything else (e.g. provider
// misconfiguration) should surface, not loop forever.
const RETRYABLE = new Set(["auth/network-request-failed", "auth/too-many-requests"])

/**
 * Resolve with the app's Firebase identity, minting a silent Guest
 * (anonymous) identity when none exists — ADR 0002. Whenever the app opens
 * without an identity this retries quietly until connectivity allows the
 * sign-in; there is no designed first-run-offline UX (spec § Identity).
 */
export async function ensureIdentity(auth: Auth): Promise<User> {
  await auth.authStateReady()
  if (auth.currentUser) return auth.currentUser
  for (let attempt = 0; ; attempt++) {
    try {
      const { user } = await signInAnonymously(auth)
      return user
    } catch (err) {
      if (!isRetryable(err)) throw err
      await nextChance(Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS))
    }
  }
}

function isRetryable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    RETRYABLE.has(String((err as { code: unknown }).code))
  )
}

// Resolves after the backoff delay, or as soon as the browser reports
// connectivity is back — whichever comes first.
function nextChance(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      globalThis.removeEventListener?.("online", done)
      resolve()
    }
    const timer = setTimeout(done, delayMs)
    globalThis.addEventListener?.("online", done)
  })
}
