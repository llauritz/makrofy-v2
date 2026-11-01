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

/** The glyph inside the cloud. */
export type CloudGlyph = "off" | "cloud" | "uploading"

export type CloudButton =
  /** The faint outlined text button, cloud on its right; a tap signs in. */
  | { kind: "prompt"; label: "syncData" | "loginAgain"; glyph: "off" }
  /** The cloud alone; a tap opens Settings. */
  | { kind: "icon"; glyph: CloudGlyph }

/**
 * Which button the header shows.
 *
 * Not signed in, the cloud is off, and the text beside it invites a sign-in
 * ("Sync data", or "Log in again" once a Google session has lapsed) until the
 * user has either tapped it or opened Settings without signing in. After
 * that the cloud stands alone.
 *
 * Signed in, the cloud is on. It shows a rising arrow while changes are still
 * on their way up, and goes off while the device is offline.
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
      ? { kind: "icon", glyph: "off" }
      : { kind: "prompt", label: "syncData", glyph: "off" }
  }
  if (account === "lapsed") {
    return dismissed === "relogin"
      ? { kind: "icon", glyph: "off" }
      : { kind: "prompt", label: "loginAgain", glyph: "off" }
  }
  if (sync === "synced") return { kind: "icon", glyph: "cloud" }
  if (!online) return { kind: "icon", glyph: "off" }
  return { kind: "icon", glyph: "uploading" }
}
