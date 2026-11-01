// Seam: the header cloud button's state — the sign-in invitation while signed
// out, the cloud alone once it is turned down, and a clear header while signed
// in unless offline. Pure, so every combination is pinned here.
import { describe, expect, it } from "vitest"
import { resolveCloudButton } from "@/lib/cloud-button"

const base = {
  dismissed: null,
  sync: "synced",
  online: true,
} as const

describe("resolveCloudButton", () => {
  it("invites a Guest to sync", () => {
    expect(resolveCloudButton({ ...base, account: "guest" })).toEqual({
      kind: "prompt",
      label: "syncData",
    })
  })

  it("leaves the Guest the cloud alone once the invitation is turned down", () => {
    expect(
      resolveCloudButton({ ...base, account: "guest", dismissed: "sync" })
    ).toEqual({ kind: "icon", reason: "signedOut" })
  })

  it("asks a lapsed Google user to log in again", () => {
    expect(resolveCloudButton({ ...base, account: "lapsed" })).toEqual({
      kind: "prompt",
      label: "loginAgain",
    })
  })

  it("still asks to log in again after an old Sync data dismissal", () => {
    expect(
      resolveCloudButton({ ...base, account: "lapsed", dismissed: "sync" })
    ).toEqual({ kind: "prompt", label: "loginAgain" })
  })

  it("drops to the cloud alone once Log in again is turned down", () => {
    expect(
      resolveCloudButton({ ...base, account: "lapsed", dismissed: "relogin" })
    ).toEqual({ kind: "icon", reason: "signedOut" })
  })

  it("shows nothing to a signed-in user when synced", () => {
    expect(resolveCloudButton({ ...base, account: "google" })).toEqual({
      kind: "hidden",
    })
  })

  it("shows nothing while writes are uploading online", () => {
    expect(
      resolveCloudButton({ ...base, account: "google", sync: "pending" })
    ).toEqual({ kind: "hidden" })
  })

  it("shows the off cloud while offline", () => {
    expect(
      resolveCloudButton({
        ...base,
        account: "google",
        sync: "pending",
        online: false,
      })
    ).toEqual({ kind: "icon", reason: "offline" })
  })

  it("stays clear on a lost connection the sync status hasn't confirmed yet", () => {
    expect(
      resolveCloudButton({ ...base, account: "google", online: false })
    ).toEqual({ kind: "hidden" })
  })
})
