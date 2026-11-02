// Seam: the plan mirror (ADR 0011 for the AI cycle) — what a returning launch
// paints the fill counter from before Firebase Auth has settled. Pure storage
// round-trips through an in-memory store.
import { describe, expect, it } from "vitest"

import {
  PLAN_MIRROR_KEY,
  readPlanMirror,
  writePlanMirror,
  type PlanMirror,
  type PlanMirrorStore,
} from "@/data/plan-mirror"

function memoryStore(): PlanMirrorStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

const free: PlanMirror = {
  uid: "u1",
  createdMs: Date.parse("2026-10-20T09:00:00Z"),
  entitlement: null,
  cycleId: "2026-10-20T09:00:00.000Z",
  usage: { fills: 10, calls: 12, grounded: 4 },
}

describe("plan mirror", () => {
  it("round-trips a Free account's cycle", () => {
    const store = memoryStore()
    writePlanMirror(free, store)
    expect(readPlanMirror("u1", store)).toEqual(free)
  })

  it("round-trips an entitlement's dates", () => {
    const store = memoryStore()
    const paid: PlanMirror = {
      ...free,
      entitlement: {
        plan: "pro",
        billing: "monthly",
        status: "active",
        planStartedAt: new Date("2026-10-25T12:00:00Z"),
        currentPeriodEnd: new Date("2026-11-25T12:00:00Z"),
        cancelsAt: null,
      },
    }
    writePlanMirror(paid, store)
    expect(readPlanMirror("u1", store)).toEqual(paid)
  })

  it("ignores another profile's copy", () => {
    const store = memoryStore()
    writePlanMirror(free, store)
    expect(readPlanMirror("u2", store)).toBeNull()
    expect(readPlanMirror(null, store)).toBeNull()
  })

  it("reads nothing from an empty or corrupt store", () => {
    const store = memoryStore()
    expect(readPlanMirror("u1", store)).toBeNull()
    store.data.set(PLAN_MIRROR_KEY, "{not json")
    expect(readPlanMirror("u1", store)).toBeNull()
    expect(readPlanMirror("u1", null)).toBeNull()
  })

  it("skips the storage write when nothing changed", () => {
    const store = memoryStore()
    let writes = 0
    const counting: PlanMirrorStore = {
      getItem: store.getItem,
      setItem: (k, v) => {
        writes++
        store.setItem(k, v)
      },
    }
    writePlanMirror(free, counting)
    writePlanMirror({ ...free }, counting)
    expect(writes).toBe(1)
    writePlanMirror({ ...free, usage: { ...free.usage, fills: 11 } }, counting)
    expect(writes).toBe(2)
  })
})
