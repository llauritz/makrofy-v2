// What the header cloud button needs to remember across launches: whether this
// device has been signed in with Google, and which sign-in invitation the user
// has already turned down. Kept in localStorage, so the very first frame paints
// the right button before Firebase Auth settles (it blocks on a server
// round-trip, see boot-mirror.ts). Every read and write is guarded: with
// storage unavailable the button simply forgets between launches.
import * as React from "react"
import { onIdTokenChanged } from "firebase/auth"

import { auth } from "@/lib/firebase"
import type { CloudAccount, DismissedPrompt } from "@/lib/cloud-button"

const KEY = "yaffle:cloud:v1"

interface Stored {
  /** Signed in with Google here at some point, and not signed out since. */
  wasGoogle: boolean
  dismissed: DismissedPrompt
}

const EMPTY: Stored = { wasGoogle: false, dismissed: null }

function read(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return EMPTY
    const v = JSON.parse(raw) as Partial<Stored>
    return {
      wasGoogle: v.wasGoogle === true,
      dismissed:
        v.dismissed === "sync" || v.dismissed === "relogin"
          ? v.dismissed
          : null,
    }
  } catch {
    return EMPTY
  }
}

let current: Stored = read()
const listeners = new Set<() => void>()

function write(next: Stored) {
  if (
    next.wasGoogle === current.wasGoogle &&
    next.dismissed === current.dismissed
  )
    return
  current = next
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The user turned the current invitation down: they opened Settings (by the
 * invitation itself or the gear), where sign-in lives. Called as it opens, so
 * leaving it, or coming back from Google without signing in, finds the cloud
 * alone. A no-op while signed in with Google.
 */
export function dismissCloudPrompt() {
  const user = auth.currentUser
  if (user && !user.isAnonymous) return
  write({ ...current, dismissed: current.wasGoogle ? "relogin" : "sync" })
}

/**
 * A deliberate sign-out from Settings: this is not a lapsed session, so no
 * "Log in again", and the user plainly knows where sign-in lives, so no
 * "Sync data" either.
 */
export function forgetGoogleAccount() {
  write({ wasGoogle: false, dismissed: "sync" })
}

// Auth settles once per launch; until then a null user means "not known yet",
// after it, "no identity at all" (an unexpected sign-out that nothing has
// replaced with a Guest).
let authSettled = false
let settledPromise: Promise<void> | undefined
function settled() {
  settledPromise ??= auth.authStateReady().then(() => {
    authSettled = true
  })
  return settledPromise
}

/**
 * Who the header cloud is syncing as, plus the remembered dismissal. Before
 * auth settles it trusts the last launch, so a signed-in device never flashes
 * "Sync data" or "Log in again" on the way up.
 */
export function useCloudAccount(): {
  account: CloudAccount
  dismissed: DismissedPrompt
} {
  const stored = React.useSyncExternalStore(subscribe, () => current)
  const [user, setUser] = React.useState(() => ({
    settled: authSettled,
    kind: kindOf(auth.currentUser),
  }))

  React.useEffect(() => {
    let live = true
    void settled().then(() => {
      if (live) setUser({ settled: true, kind: kindOf(auth.currentUser) })
    })
    const off = onIdTokenChanged(auth, (u) => {
      // A Google sign-in clears any old dismissal, so a later lapse asks
      // again.
      if (u && !u.isAnonymous) write({ wasGoogle: true, dismissed: null })
      setUser({ settled: authSettled, kind: kindOf(u) })
    })
    return () => {
      live = false
      off()
    }
  }, [])

  let account: CloudAccount
  if (user.kind === "google") account = "google"
  else if (user.kind === "none" && !user.settled)
    account = stored.wasGoogle ? "google" : "guest"
  else account = stored.wasGoogle ? "lapsed" : "guest"

  return { account, dismissed: stored.dismissed }
}

function kindOf(
  u: { isAnonymous: boolean } | null
): "google" | "guest" | "none" {
  if (!u) return "none"
  return u.isAnonymous ? "guest" : "google"
}
