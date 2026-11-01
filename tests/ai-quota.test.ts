// Seam: the AI quota module — the app-side per-user daily counter behind the
// ✨ button (spec § AI macro-fill, #21). Advisory by design: App Check is the
// hard gate and the budget alert the backstop; this counter is what keeps one
// signed-in user from burning the grounding budget. One doc per Day at
// /users/{uid}/aiUsage/{YYYY-MM-DD}, covered by the generic UID-match rules.
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { waitForPendingWrites } from "firebase/firestore"

import {
  AI_DAILY_LIMIT,
  consumeAiUse,
  cycleDocId,
  listenToCycleUsage,
  readAiUsage,
  recordAiCall,
  type CycleUsage,
} from "@/data/ai-quota"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  type EmulatorApp,
  waitFor,
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

// ADR 0013: the plan cycle counter — fills, calls and grounded in one write.
describe("ai cycle counter", () => {
  let ctx: EmulatorApp
  let uid: string
  const CYCLE = cycleDocId(new Date("2026-11-01T10:00:00Z"))

  beforeEach(async () => {
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
  })

  afterEach(async () => {
    await destroyEmulatorApp(ctx)
    await clearFirestoreData()
  })

  it("counts a clarifying answer as a call but not a fill", async () => {
    let usage: CycleUsage | undefined
    const stop = listenToCycleUsage(ctx.db, uid, CYCLE, (u) => (usage = u))
    await waitFor(() => usage)
    expect(usage).toEqual({ fills: 0, calls: 0, grounded: 0 })

    recordAiCall(ctx.db, uid, CYCLE, { fill: true, grounded: true })
    recordAiCall(ctx.db, uid, CYCLE, { fill: false, grounded: false })
    recordAiCall(ctx.db, uid, CYCLE, { fill: true, grounded: false })
    await waitForPendingWrites(ctx.db)

    await waitFor(() => (usage?.calls === 3 ? usage : undefined))
    expect(usage).toEqual({ fills: 2, calls: 3, grounded: 1 })
    stop()
  })

  it("keeps each cycle's counts apart", async () => {
    recordAiCall(ctx.db, uid, CYCLE, { fill: true, grounded: false })
    await waitForPendingWrites(ctx.db)
    let next: CycleUsage | undefined
    const stop = listenToCycleUsage(
      ctx.db,
      uid,
      cycleDocId(new Date("2026-12-01T10:00:00Z")),
      (u) => (next = u),
    )
    await waitFor(() => next)
    expect(next?.fills).toBe(0)
    stop()
  })
})
