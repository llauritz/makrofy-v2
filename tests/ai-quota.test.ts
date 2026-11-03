// Seam: the AI allowance (ADR 0013, ADR 0016). The aiFill function admits each
// round trip against the plan's cycle limit in one transaction and counts it in
// /users/{uid}/aiCycles/{cycle start}; the app only listens to that doc. The
// pure rule (admitCall) runs without Firebase; the transactional admission and
// the cost counters run against the emulator through the Admin SDK, exactly as
// the deployed function does, and the app's listener reads what they wrote.
import { deleteApp, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  admitCall,
  BURST_CALLS,
  BURST_WINDOW_MS,
  CYCLE_LIMIT,
  FOLLOW_UP_SLACK,
  NO_COUNTS,
  type CycleCounts,
} from "../functions/src/ai-allowance"
import { admitAiCall, recordAiCost } from "../functions/src/ai-fill"
import { cycleDocId, listenToCycleUsage, type CycleUsage } from "@/data/ai-quota"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  type EmulatorApp,
  waitFor,
} from "./emulator"

const T0 = Date.parse("2026-11-01T10:00:00Z")

describe("admitCall", () => {
  const at = (counts: Partial<CycleCounts>) => ({ ...NO_COUNTS, ...counts })

  it("counts a fill as a fill and a call", () => {
    const r = admitCall(NO_COUNTS, { final: false, limit: 10, nowMs: T0 })
    expect(r).toEqual({
      ok: true,
      next: { fills: 1, calls: 1, burstStartMs: T0, burstCalls: 1 },
    })
  })

  it("counts a clarifying answer as a call but not a fill", () => {
    const r = admitCall(at({ fills: 1, calls: 1 }), {
      final: true,
      limit: 10,
      nowMs: T0,
    })
    expect(r.ok && r.next).toMatchObject({ fills: 1, calls: 2 })
  })

  it("refuses a fill at the limit, but not the answer to its question", () => {
    const full = at({ fills: 10, calls: 10 })
    expect(admitCall(full, { final: false, limit: 10, nowMs: T0 })).toEqual({
      ok: false,
      refusal: "cycle-exhausted",
    })
    expect(admitCall(full, { final: true, limit: 10, nowMs: T0 }).ok).toBe(true)
  })

  it("keeps clarifying answers from outnumbering fills", () => {
    const answers = 2 + FOLLOW_UP_SLACK
    const counts = at({ fills: 2, calls: 2 + answers })
    expect(admitCall(counts, { final: true, limit: 10, nowMs: T0 })).toEqual({
      ok: false,
      refusal: "follow-ups",
    })
  })

  it("brakes a burst and lets the next window through", () => {
    const busy = at({ fills: 5, calls: BURST_CALLS, burstStartMs: T0, burstCalls: BURST_CALLS })
    expect(
      admitCall(busy, { final: false, limit: 1000, nowMs: T0 + 1_000 }),
    ).toEqual({ ok: false, refusal: "too-fast" })
    const later = admitCall(busy, {
      final: false,
      limit: 1000,
      nowMs: T0 + BURST_WINDOW_MS,
    })
    expect(later.ok && later.next).toMatchObject({
      burstStartMs: T0 + BURST_WINDOW_MS,
      burstCalls: 1,
    })
  })

  it("keeps the published plan limits", () => {
    expect(CYCLE_LIMIT).toEqual({ free: 10, pro: 1_000, unlimited: 10_000 })
  })
})

describe("admitAiCall (server, emulator)", () => {
  let adminApp: App
  let admin: Firestore
  const UID = "alice"
  const CREATED = new Date("2026-10-20T08:00:00Z")
  const accountCreated = async () => CREATED

  beforeAll(() => {
    adminApp = initializeApp({ projectId: "goyaffle" }, "ai-allowance")
    admin = getFirestore(adminApp)
  })

  afterAll(async () => {
    await deleteApp(adminApp)
  })

  afterEach(async () => {
    await clearFirestoreData()
  })

  const cycleDoc = (start: Date) =>
    admin.doc(`users/${UID}/aiCycles/${cycleDocId(start)}`)

  it("anchors Free on the account's creation and counts the fill", async () => {
    const now = new Date("2026-11-03T12:00:00Z")
    const r = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    expect(r).toMatchObject({ ok: true, plan: "free" })
    const data = (await cycleDoc(CREATED).get()).data()
    expect(data).toMatchObject({ fills: 1, calls: 1 })
  })

  it("refuses Free's eleventh fill with the reset date", async () => {
    await cycleDoc(CREATED).set({ fills: 10, calls: 10 })
    const now = new Date("2026-11-03T12:00:00Z")
    const r = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    expect(r).toEqual({
      ok: false,
      refusal: "cycle-exhausted",
      plan: "free",
      limit: 10,
      resetsOn: new Date(CREATED.getTime() + 30 * 86_400_000),
    })
  })

  it("gives a paying user the plan's limit, anchored on planStartedAt", async () => {
    const started = new Date("2026-11-02T09:00:00Z")
    await admin.doc(`users/${UID}/settings/subscription`).set({
      plan: "pro",
      status: "active",
      planStartedAt: Timestamp.fromDate(started),
      currentPeriodEnd: Timestamp.fromDate(new Date("2026-12-02T09:00:00Z")),
    })
    await cycleDoc(started).set({ fills: 999, calls: 999 })
    const now = new Date("2026-11-03T12:00:00Z")
    const ok = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    expect(ok).toMatchObject({ ok: true, plan: "pro" })
    const refused = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    expect(refused).toMatchObject({ ok: false, refusal: "cycle-exhausted", limit: 1_000 })
  })

  it("treats a lapsed subscription as Free", async () => {
    const started = new Date("2026-10-01T09:00:00Z")
    await admin.doc(`users/${UID}/settings/subscription`).set({
      plan: "unlimited",
      status: "canceled",
      planStartedAt: Timestamp.fromDate(started),
      currentPeriodEnd: null,
    })
    const now = new Date("2026-11-03T12:00:00Z")
    const r = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    expect(r).toMatchObject({ ok: true, plan: "free" })
  })

  it("never lets two phones take the last fill", async () => {
    await cycleDoc(CREATED).set({ fills: 9, calls: 9 })
    const now = new Date("2026-11-03T12:00:00Z")
    const results = await Promise.all([
      admitAiCall(admin, UID, { final: false, now, accountCreated }),
      admitAiCall(admin, UID, { final: false, now, accountCreated }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await cycleDoc(CREATED).get()).data()?.fills).toBe(10)
  })

  it("adds search queries to the cycle and to the day's totals", async () => {
    const now = new Date("2026-11-03T12:00:00Z")
    const r = await admitAiCall(admin, UID, { final: false, now, accountCreated })
    if (!r.ok) throw new Error("refused")
    await recordAiCost(admin, r.cycleRef, { final: false, queries: 3, steps: 2, searchTimedOut: false, now })
    await recordAiCost(admin, r.cycleRef, { final: true, queries: 0, steps: 3, searchTimedOut: true, now })
    expect((await r.cycleRef.get()).data()).toMatchObject({ grounded: 1, queries: 3 })
    expect((await admin.doc("aiStats/2026-11-03").get()).data()).toMatchObject({
      fills: 1,
      calls: 2,
      geminiCalls: 5,
      grounded: 1,
      queries: 3,
      searchTimeouts: 1,
    })
  })
})

describe("the app's cycle listener", () => {
  let ctx: EmulatorApp
  let adminApp: App
  let uid: string
  const CYCLE = cycleDocId(new Date("2026-11-01T10:00:00Z"))

  beforeEach(async () => {
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
    adminApp = initializeApp({ projectId: "goyaffle" }, `listener-${Date.now()}`)
  })

  afterEach(async () => {
    await destroyEmulatorApp(ctx)
    await deleteApp(adminApp)
    await clearFirestoreData()
  })

  it("reads zeros before the first fill, then the server's counts", async () => {
    let usage: CycleUsage | undefined
    const stop = listenToCycleUsage(ctx.db, uid, CYCLE, (u) => (usage = u))
    await waitFor(() => usage)
    expect(usage).toEqual({ fills: 0, calls: 0, grounded: 0 })

    await getFirestore(adminApp)
      .doc(`users/${uid}/aiCycles/${CYCLE}`)
      .set({ fills: 2, calls: 3, grounded: 1, queries: 4 })
    await waitFor(() => (usage?.calls === 3 ? usage : undefined))
    expect(usage).toEqual({ fills: 2, calls: 3, grounded: 1 })
    stop()
  })
})
