// Seam: turning what a person types into a valid kcal Goal
// (src/lib/goal-input.ts). Shared by the onboarding goal screen and the
// settings goal editor. The V1 failure classes this pins: no decimal
// truncation (round, don't floor), and never a NaN/0 Goal reaching the ring
// (spec § V1 failure classes; § Onboarding).
import { describe, expect, it } from "vitest"

import {
  MAX_GOAL_KCAL,
  MIN_GOAL_KCAL,
  clampGoalKcal,
  parseGoalKcal,
} from "@/lib/goal-input"

describe("parseGoalKcal", () => {
  it("parses a plain integer", () => {
    expect(parseGoalKcal("2000")).toBe(2000)
  })

  it("rounds decimals rather than truncating them", () => {
    expect(parseGoalKcal("2000.7")).toBe(2001)
    expect(parseGoalKcal("1999.4")).toBe(1999)
  })

  it("ignores surrounding whitespace", () => {
    expect(parseGoalKcal("  2200  ")).toBe(2200)
  })

  it("rejects a blank field", () => {
    expect(parseGoalKcal("")).toBeNull()
    expect(parseGoalKcal("   ")).toBeNull()
  })

  it("rejects non-numeric input", () => {
    expect(parseGoalKcal("abc")).toBeNull()
    expect(parseGoalKcal("2000 kcal")).toBeNull()
  })

  it("rejects zero and negative goals — the ring needs a positive target", () => {
    expect(parseGoalKcal("0")).toBeNull()
    expect(parseGoalKcal("-500")).toBeNull()
  })

  it("rejects non-finite input", () => {
    expect(parseGoalKcal("Infinity")).toBeNull()
  })

  it("clamps an absurdly large figure to the ceiling instead of rejecting it", () => {
    expect(parseGoalKcal("500000")).toBe(MAX_GOAL_KCAL)
  })
})

describe("clampGoalKcal", () => {
  it("pulls values into range and rounds to a whole kcal", () => {
    expect(clampGoalKcal(2000)).toBe(2000)
    expect(clampGoalKcal(2000.6)).toBe(2001)
    expect(clampGoalKcal(-5)).toBe(MIN_GOAL_KCAL)
    expect(clampGoalKcal(999_999)).toBe(MAX_GOAL_KCAL)
  })
})
