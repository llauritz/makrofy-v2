// Seam: the Health Connect sync rules (ADR 0014) — which Entries become
// NutritionRecords, when a record is rewritten or removed, and where in time
// it lands. Pure; the runner that applies a plan is covered in
// health-connect.test.ts.
import { describe, expect, it } from "vitest"

import {
  applyPlan,
  fingerprint,
  planNutritionSync,
  readLedgerFor,
  recordStartMs,
  toNutritionRecord,
  type SyncEntry,
} from "@/lib/health-sync"

const SINCE = new Date(2026, 10, 1, 8, 0).getTime()

function entry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    id: "e1",
    date: "2026-11-01",
    label: "Porridge",
    kcal: 320,
    protein: 12,
    mealType: "breakfast",
    createdAtMs: new Date(2026, 10, 1, 9, 15).getTime(),
    ...overrides,
  }
}

const ledgerOf = (...entries: SyncEntry[]) =>
  Object.fromEntries(
    entries.map((e) => [e.id, fingerprint(toNutritionRecord(e))])
  )

describe("recordStartMs", () => {
  it("uses the log time for an Entry logged on its own Day", () => {
    const e = entry()
    expect(recordStartMs(e)).toBe(e.createdAtMs)
  })

  it("puts a Backfilled Entry at local noon of its Day", () => {
    const e = entry({ date: "2026-10-28" })
    expect(recordStartMs(e)).toBe(new Date(2026, 9, 28, 12, 0).getTime())
  })
})

describe("toNutritionRecord", () => {
  it("maps kcal, present macros, label and meal type, keyed by the Entry id", () => {
    const record = toNutritionRecord(entry({ fat: 6 }))
    expect(record).toEqual({
      clientRecordId: "e1",
      name: "Porridge",
      startTimeMs: entry().createdAtMs,
      endTimeMs: entry().createdAtMs + 60_000,
      mealType: "breakfast",
      kcal: 320,
      protein: 12,
      fat: 6,
    })
    expect(record).not.toHaveProperty("carbs")
  })
})

describe("planNutritionSync", () => {
  it("sends a new Entry created after the toggle went on", () => {
    const plan = planNutritionSync(
      [entry()],
      {},
      { sinceMs: SINCE, complete: true }
    )
    expect(plan.upserts.map((r) => r.clientRecordId)).toEqual(["e1"])
    expect(plan.deletes).toEqual([])
  })

  it("leaves history from before the toggle alone (only new entries)", () => {
    const old = entry({ createdAtMs: SINCE - 1 })
    const plan = planNutritionSync(
      [old],
      {},
      { sinceMs: SINCE, complete: true }
    )
    expect(plan).toEqual({ upserts: [], deletes: [] })
  })

  it("writes nothing when the ledger already holds the same record", () => {
    const e = entry()
    const plan = planNutritionSync([e], ledgerOf(e), {
      sinceMs: SINCE,
      complete: true,
    })
    expect(plan).toEqual({ upserts: [], deletes: [] })
  })

  it("rewrites an edited Entry, even one older than the toggle", () => {
    const before = entry({ createdAtMs: SINCE - 1 })
    const edited = { ...before, kcal: 410 }
    const plan = planNutritionSync([edited], ledgerOf(before), {
      sinceMs: SINCE,
      complete: true,
    })
    expect(plan.upserts.map((r) => r.kcal)).toEqual([410])
  })

  it("deletes a written record whose Entry is gone, on a confirmed snapshot", () => {
    const e = entry()
    const plan = planNutritionSync([], ledgerOf(e), {
      sinceMs: SINCE,
      complete: true,
    })
    expect(plan.deletes).toEqual(["e1"])
  })

  it("never reads a missing Entry as deleted from a cache-only snapshot", () => {
    const e = entry()
    const plan = planNutritionSync([], ledgerOf(e), {
      sinceMs: SINCE,
      complete: false,
    })
    expect(plan.deletes).toEqual([])
  })

  it("skips an empty 0-kcal Entry, and removes its record once it empties", () => {
    const empty = entry({ kcal: 0, protein: undefined })
    expect(
      planNutritionSync([empty], {}, { sinceMs: SINCE, complete: true })
    ).toEqual({ upserts: [], deletes: [] })
    expect(
      planNutritionSync([empty], ledgerOf(entry()), {
        sinceMs: SINCE,
        complete: true,
      }).deletes
    ).toEqual(["e1"])
  })
})

describe("applyPlan / readLedgerFor", () => {
  it("records upserts and forgets deletes", () => {
    const a = entry({ id: "a" })
    const b = entry({ id: "b" })
    const next = applyPlan(ledgerOf(a), {
      upserts: [toNutritionRecord(b)],
      deletes: ["a"],
    })
    expect(next).toEqual(ledgerOf(b))
  })

  it("starts another profile from an empty ledger", () => {
    const stored = { uid: "guest", records: ledgerOf(entry()) }
    expect(readLedgerFor(stored, "guest")).toEqual(stored.records)
    expect(readLedgerFor(stored, "account")).toEqual({})
    expect(readLedgerFor(null, "account")).toEqual({})
  })
})
