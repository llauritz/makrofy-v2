// The header cloud button's state, derived. Pure and Firebase-free, like
// lib/sync.ts beside it, so every combination is cheap to pin down in tests;
// src/data/cloud-account.ts feeds it the account and the remembered prompt.

import type { SyncStatus } from "@/lib/sync"

/**
 * Who the app is syncing as, from the button's point of view.
 * "google" — a linked Google account (or, before auth settles, a device that
 *   last ran signed in).
 * "guest" — an anonymous Guest that has never been signed in here.
 * "lapsed" — this device was signed in with Google and no longer is, without
 *   the user signing out: Google wants them to log in again.
 */
export type CloudAccount = "google" | "guest" | "lapsed"

/** Which invitation the user has already turned down on this device. */
export type DismissedPrompt = "sync" | "relogin" | null

export type CloudButton =
  /** Nothing in the header: signed in and syncing as it should. */
  | { kind: "hidden" }
  /** The faint outlined text button, words only; a tap opens Settings onto sign-in. */
  | { kind: "prompt"; label: "syncData" | "loginAgain" }
  /** The off cloud alone on the background; a tap opens Settings. */
  | { kind: "icon"; reason: "signedOut" | "offline" }

/**
 * Which button the header shows.
 *
 * Not signed in, a text button invites a sign-in ("Sync data", or "Log in
 * again" once a Google session has lapsed) until the user has opened
 * Settings, through it or the gear, without signing in. After that the off
 * cloud stands alone.
 *
 * Signed in, the header stays clear: synced and uploading show nothing. Only
 * an offline stretch (after the sync settle) brings the off cloud back.
 */
export function resolveCloudButton({
  account,
  dismissed,
  sync,
  online,
}: {
  account: CloudAccount
  dismissed: DismissedPrompt
  sync: SyncStatus
  online: boolean
}): CloudButton {
  if (account === "guest") {
    return dismissed === "sync"
      ? { kind: "icon", reason: "signedOut" }
      : { kind: "prompt", label: "syncData" }
  }
  if (account === "lapsed") {
    return dismissed === "relogin"
      ? { kind: "icon", reason: "signedOut" }
      : { kind: "prompt", label: "loginAgain" }
  }
  if (sync !== "synced" && !online) return { kind: "icon", reason: "offline" }
  return { kind: "hidden" }
}
