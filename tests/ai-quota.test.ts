// Seam: the AI quota module — the app-side per-user daily counter behind the
// ✨ button (spec § AI macro-fill, #21). Advisory by design: App Check is the
// hard gate and the budget alert the backstop; this counter is what keeps one
// signed-in user from burning the grounding budget. One doc per Day at
// /users/{uid}/aiUsage/{YYYY-MM-DD}, covered by the generic UID-match rules.
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { waitForPendingWrites } from "firebase/firestore"

import { AI_DAILY_LIMIT, consumeAiUse, readAiUsage } from "@/data/ai-quota"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  type EmulatorApp,
} from "./emulator"

const DAY = "2026-07-16"

describe("ai quota", () => {
  let ctx: EmulatorApp
  let uid: string

  beforeEach(async () => {
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
  })

  afterEach(async () => {
    await destroyEmulatorApp(ctx)
    await clearFirestoreData()
  })

  it("reads zero for a Day with no uses yet", async () => {
    expect(await readAiUsage(ctx.db, uid, DAY)).toBe(0)
  })

  it("counts each consumed use", async () => {
    consumeAiUse(ctx.db, uid, DAY)
    consumeAiUse(ctx.db, uid, DAY)
    await waitForPendingWrites(ctx.db)
    expect(await readAiUsage(ctx.db, uid, DAY)).toBe(2)
  })

  it("keeps each Day's count separate — yesterday never blocks today", async () => {
    consumeAiUse(ctx.db, uid, DAY)
    await waitForPendingWrites(ctx.db)
    expect(await readAiUsage(ctx.db, uid, "2026-07-17")).toBe(0)
  })

  it("has a limit that allows normal daily logging many times over", () => {
    // The exact number is tunable; the property that matters is that it is a
    // real bound (finite, positive) — the advisory brake of the safety rails.
    expect(AI_DAILY_LIMIT).toBeGreaterThanOrEqual(20)
    expect(Number.isFinite(AI_DAILY_LIMIT)).toBe(true)
  })
})
