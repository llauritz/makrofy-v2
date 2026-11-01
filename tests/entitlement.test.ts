// Seam: reading the plan (ADR 0012) and placing the AI cycle (ADR 0013) — the
// pure rules the app derives its limits from. The webhook side lives in
// paddle-webhook.test.ts.
import { Timestamp } from "firebase/firestore"
import { describe, expect, it } from "vitest"

import {
  effectivePlan,
  OFFLINE_GRACE_DAYS,
  parseEntitlement,
  type Entitlement,
} from "@/data/entitlement"
import { CYCLE_DAYS, cycleWindow } from "@/data/plans"

const DAY = 86_400_000
const T0 = new Date("2026-11-01T10:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)

const pro = (over: Partial<Entitlement> = {}): Entitlement => ({
  plan: "pro",
  billing: "annual",
  status: "active",
  planStartedAt: T0,
  currentPeriodEnd: at(365),
  cancelsAt: null,
  ...over,
})

describe("effectivePlan", () => {
  it("is Free without a doc", () => {
    expect(effectivePlan(null, T0)).toBe("free")
  })

  it("holds the paid plan while active or while the card is retried", () => {
    expect(effectivePlan(pro(), at(10))).toBe("pro")
    expect(effectivePlan(pro({ status: "past_due" }), at(10))).toBe("pro")
  })

  it("drops to Free once canceled or paused", () => {
    expect(effectivePlan(pro({ plan: "free", status: "canceled" }), at(10))).toBe("free")
    expect(effectivePlan(pro({ status: "paused" }), at(10))).toBe("free")
  })

  it("keeps a stale paid plan for the offline grace, then lets it go", () => {
    const end = pro({ currentPeriodEnd: at(30) })
    expect(effectivePlan(end, at(30 + OFFLINE_GRACE_DAYS - 0.5))).toBe("pro")
    expect(effectivePlan(end, at(30 + OFFLINE_GRACE_DAYS + 0.5))).toBe("free")
  })
})

describe("parseEntitlement", () => {
  it("reads a webhook-written doc", () => {
    const e = parseEntitlement({
      plan: "unlimited",
      billing: "monthly",
      status: "active",
      planStartedAt: Timestamp.fromDate(T0),
      currentPeriodEnd: Timestamp.fromDate(at(30)),
      cancelsAt: null,
    })
    expect(e).toEqual({
      plan: "unlimited",
      billing: "monthly",
      status: "active",
      planStartedAt: T0,
      currentPeriodEnd: at(30),
      cancelsAt: null,
    })
  })

  it("treats a missing or malformed doc as none", () => {
    expect(parseEntitlement(undefined)).toBeNull()
    expect(parseEntitlement({ plan: "gold", planStartedAt: Timestamp.fromDate(T0) })).toBeNull()
    expect(parseEntitlement({ plan: "pro" })).toBeNull()
  })
})

describe("cycleWindow", () => {
  it("counts whole 30-day cycles from the anchor", () => {
    expect(cycleWindow(T0, at(0))).toEqual({ start: T0, end: at(CYCLE_DAYS) })
    expect(cycleWindow(T0, at(29.9)).start).toEqual(T0)
    expect(cycleWindow(T0, at(30))).toEqual({ start: at(30), end: at(60) })
    expect(cycleWindow(T0, at(95)).start).toEqual(at(90))
  })

  it("stays in the first cycle when the clock is behind the anchor", () => {
    expect(cycleWindow(T0, at(-3)).start).toEqual(T0)
  })
})
