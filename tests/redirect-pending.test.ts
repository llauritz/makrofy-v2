/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"

// The mark that holds the splash while a Google sign-in lands: set before
// leaving for Google, read when the next load starts, cleared once the account
// is settled.

const KEY = "yaffle:google-redirect:v1"

async function freshLoad() {
  vi.resetModules()
  return import("@/data/redirect-pending")
}

describe("redirect pending", () => {
  beforeEach(() => sessionStorage.clear())

  it("is off on an ordinary load", async () => {
    const m = await freshLoad()
    expect(m.isRedirectPending()).toBe(false)
  })

  it("survives the trip to Google and back in the same tab", async () => {
    ;(await freshLoad()).markRedirectPending()
    const back = await freshLoad()
    expect(back.isRedirectPending()).toBe(true)
  })

  it("clears once the returning load settles, and stays clear", async () => {
    sessionStorage.setItem(KEY, "1")
    const back = await freshLoad()
    back.settleRedirect()
    expect(back.isRedirectPending()).toBe(false)
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect((await freshLoad()).isRedirectPending()).toBe(false)
  })
})
