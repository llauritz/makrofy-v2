// Seam: the Coverage control's visibility gate (issue #42) — pure clock/day
// logic, so the evening rule and the closed-day rule live in one testable
// place. The control itself renders whatever this admits.
import { describe, expect, it } from "vitest"
import {
  COVERAGE_EVENING_HOUR,
  nextCoverageGateChange,
  showCoverageControl,
} from "@/screens/main/coverage"

// 2026-07-11 as "now", at a given hour.
const at = (hour: number, minute = 0) => new Date(2026, 6, 11, hour, minute)

describe("showCoverageControl", () => {
  it("never shows for a Day with no Entries — nothing to label", () => {
    expect(showCoverageControl("2026-07-10", 0, at(21))).toBe(false)
    expect(showCoverageControl("2026-07-11", 0, at(21))).toBe(false)
  })

  it("shows on any past Day holding Entries, whatever the clock says", () => {
    expect(showCoverageControl("2026-07-10", 1, at(8))).toBe(true)
    expect(showCoverageControl("2025-12-31", 3, at(8))).toBe(true)
  })

  it("shows on today only from the evening hour", () => {
    expect(showCoverageControl("2026-07-11", 2, at(COVERAGE_EVENING_HOUR - 1, 59))).toBe(false)
    expect(showCoverageControl("2026-07-11", 2, at(COVERAGE_EVENING_HOUR))).toBe(true)
    expect(showCoverageControl("2026-07-11", 2, at(23, 59))).toBe(true)
  })

  it("never shows on a future Day", () => {
    expect(showCoverageControl("2026-07-12", 2, at(21))).toBe(false)
  })
})

describe("nextCoverageGateChange", () => {
  it("is this evening's boundary while today waits on the clock", () => {
    expect(nextCoverageGateChange("2026-07-11", 2, at(19, 30))).toEqual(
      at(COVERAGE_EVENING_HOUR),
    )
  })

  it("is null once open, for other Days, and with nothing to label", () => {
    expect(nextCoverageGateChange("2026-07-11", 2, at(21))).toBeNull()
    expect(nextCoverageGateChange("2026-07-10", 2, at(19))).toBeNull()
    expect(nextCoverageGateChange("2026-07-12", 2, at(19))).toBeNull()
    expect(nextCoverageGateChange("2026-07-11", 0, at(19))).toBeNull()
  })
})
