// Seam: the Goal settings doc — /users/{uid}/settings/goal, the one synced
// setting (ADR 0003: the progress ring must agree across devices).
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { setGoal, listenToGoal, type Goal } from "@/data/goal"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

let ctx: EmulatorApp
let uid: string
let stop: (() => void) | undefined

beforeEach(async () => {
  await clearFirestoreData()
  ctx = createEmulatorApp()
  uid = (await ensureIdentity(ctx.auth)).uid
})

afterEach(async () => {
  stop?.()
  stop = undefined
  await destroyEmulatorApp(ctx)
})

describe("the Goal doc", () => {
  it("reads null before onboarding has set one", async () => {
    const states: Array<Goal | null> = []
    stop = listenToGoal(ctx.db, uid, (goal) => states.push(goal))
    const first = await waitFor(() => (states.length > 0 ? states : undefined))
    expect(first[0]).toBeNull()
  })

  it("round-trips a write and updates live", async () => {
    const states: Array<Goal | null> = []
    stop = listenToGoal(ctx.db, uid, (goal) => states.push(goal))

    setGoal(ctx.db, uid, { kcal: 2000 })
    await waitFor(() => states.find((g) => g?.kcal === 2000))

    setGoal(ctx.db, uid, { kcal: 2200, protein: 140 })
    const updated = await waitFor(() => states.find((g) => g?.kcal === 2200))
    expect(updated).toEqual({ kcal: 2200, protein: 140 })
  })

  it("each save replaces the whole Goal — dropped macro targets stay dropped", async () => {
    const states: Array<Goal | null> = []
    stop = listenToGoal(ctx.db, uid, (goal) => states.push(goal))

    setGoal(ctx.db, uid, { kcal: 2200, protein: 140 })
    await waitFor(() => states.find((g) => g?.protein === 140))

    setGoal(ctx.db, uid, { kcal: 2200 })
    const replaced = await waitFor(() =>
      states.find((g) => g?.kcal === 2200 && !("protein" in (g ?? {}))),
    )
    expect(replaced).toEqual({ kcal: 2200 })
  })
})
