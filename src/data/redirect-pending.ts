import * as React from "react"

// A Google sign-in redirect in flight (spec § Identity). startGoogleSignIn
// marks it in sessionStorage just before leaving for Google; the mark survives
// the round trip in the same tab, so the load that comes back knows a sign-in
// is landing. Until bootstrapIdentity has finished it, the Guest restored from
// persistence is about to be linked or replaced (a union merge onto the
// existing account), so the app holds the splash rather than briefly showing
// the Guest's own screen: on a fresh device, the welcome page.

const KEY = "yaffle:google-redirect:v1"

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

let pending = storage()?.getItem(KEY) === "1"
const listeners = new Set<() => void>()

/** Call right before navigating to Google. */
export function markRedirectPending(): void {
  try {
    storage()?.setItem(KEY, "1")
  } catch {
    // Storage blocked: the sign-in still works, it may just flash the Guest.
  }
}

/** Call once the returning load has finished the redirect, however it went. */
export function settleRedirect(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Nothing to clean up if storage is blocked.
  }
  if (!pending) return
  pending = false
  for (const listener of listeners) listener()
}

/** Whether this load is finishing a Google sign-in redirect, right now. */
export function isRedirectPending(): boolean {
  return pending
}

/** True while this load is finishing a Google sign-in redirect. */
export function useRedirectPending(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pending
  )
}
