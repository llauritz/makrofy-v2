// Seam: the Guest identity bootstrap — the app opens, and ensureIdentity
// resolves with a signed-in user, minting a silent anonymous identity when
// none exists (ADR 0002, spec § Identity).
import { afterEach, describe, expect, it } from "vitest"
import { ensureIdentity } from "@/data/identity"
import { createEmulatorApp, destroyEmulatorApp, type EmulatorApp } from "./emulator"

let ctx: EmulatorApp

afterEach(async () => {
  if (ctx) await destroyEmulatorApp(ctx)
})

describe("ensureIdentity", () => {
  it("mints a Guest identity when the app opens signed out", async () => {
    ctx = createEmulatorApp()
    const user = await ensureIdentity(ctx.auth)
    expect(user.isAnonymous).toBe(true)
    expect(user.uid).toBeTruthy()
    expect(ctx.auth.currentUser?.uid).toBe(user.uid)
  })

  it("returns the existing identity instead of minting a second one", async () => {
    ctx = createEmulatorApp()
    const first = await ensureIdentity(ctx.auth)
    const second = await ensureIdentity(ctx.auth)
    expect(second.uid).toBe(first.uid)
  })
})
