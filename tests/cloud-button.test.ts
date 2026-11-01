// Seam: the header cloud button's state — the sign-in invitation while signed
// out, the cloud alone once it is turned down, the live sync glyph while
// signed in. Pure, so every combination is pinned here.
import { describe, expect, it } from "vitest"
import { resolveCloudButton } from "@/lib/cloud-button"

const base = {
  dismissed: null,
  sync: "synced",
  online: true,
} as const

describe("resolveCloudButton", () => {
  it("invites a Guest to sync, with the cloud off", () => {
    expect(resolveCloudButton({ ...base, account: "guest" })).toEqual({
      kind: "prompt",
      label: "syncData",
      glyph: "off",
    })
  })

  it("leaves the Guest the cloud alone once the invitation is turned down", () => {
    expect(
      resolveCloudButton({ ...base, account: "guest", dismissed: "sync" })
    ).toEqual({ kind: "icon", glyph: "off" })
  })

  it("asks a lapsed Google user to log in again", () => {
    expect(resolveCloudButton({ ...base, account: "lapsed" })).toEqual({
      kind: "prompt",
      label: "loginAgain",
      glyph: "off",
    })
  })

  it("still asks to log in again after an old Sync data dismissal", () => {
    expect(
      resolveCloudButton({ ...base, account: "lapsed", dismissed: "sync" })
    ).toMatchObject({ kind: "prompt", label: "loginAgain" })
  })

  it("drops to the cloud alone once Log in again is turned down", () => {
    expect(
      resolveCloudButton({ ...base, account: "lapsed", dismissed: "relogin" })
    ).toEqual({ kind: "icon", glyph: "off" })
  })

  it("shows a signed-in user a quiet cloud when synced", () => {
    expect(resolveCloudButton({ ...base, account: "google" })).toEqual({
      kind: "icon",
      glyph: "cloud",
    })
  })

  it("shows the rising arrow while writes are on their way up", () => {
    expect(
      resolveCloudButton({ ...base, account: "google", sync: "pending" })
    ).toEqual({ kind: "icon", glyph: "uploading" })
  })

  it("turns the cloud off while offline", () => {
    expect(
      resolveCloudButton({
        ...base,
        account: "google",
        sync: "pending",
        online: false,
      })
    ).toEqual({ kind: "icon", glyph: "off" })
  })

  it("never invites a signed-in user, whatever was dismissed", () => {
    expect(
      resolveCloudButton({ ...base, account: "google", dismissed: null })
    ).toMatchObject({ kind: "icon" })
  })
})
