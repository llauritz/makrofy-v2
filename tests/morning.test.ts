// Seam: the morning glance strip's gates (issue #22) — pure day/state logic
// for when the strip shows and when it carries the Coverage nudge chips, kept
// out of the component like the sibling coverage.ts gate (#42).
import { describe, expect, it } from "vitest"
import type { CoverageMap } from "@/data/days"
import { statDays } from "@/lib/stats"
import { morningNudgeDay, showMorningStrip } from "@/screens/main/morning"

const TODAY = "2026-07-10"

const window14 = (
  trackedDays: string[],
  coverage: CoverageMap = new Map(),
) =>
  statDays(
    trackedDays.map((date) => ({ date, kcal: 500 })),
    coverage,
    "2026-06-27",
    TODAY,
    TODAY,
  )

describe("showMorningStrip", () => {
  const days = window14(["2026-07-08", "2026-07-09"])

  it("shows while today is unlogged and not yet dismissed", () => {
    expect(showMorningStrip(days, 0, null, TODAY)).toBe(true)
    expect(showMorningStrip(days, 0, "2026-07-09", TODAY)).toBe(true)
  })

  it("auto-dismisses on the day's first logged Entry", () => {
    expect(showMorningStrip(days, 1, null, TODAY)).toBe(false)
  })

  it("stays dismissed for the rest of the day after ✕", () => {
    expect(showMorningStrip(days, 0, TODAY, TODAY)).toBe(false)
  })

  it("never shows with no closed tracked Day to glance at", () => {
    expect(showMorningStrip(window14([]), 0, null, TODAY)).toBe(false)
    // Today's own Entries are not yesterday-history (and would dismiss anyway).
    expect(showMorningStrip(window14([TODAY]), 0, null, TODAY)).toBe(false)
  })
})

describe("morningNudgeDay", () => {
  it("is the most recent closed tracked Day while its Coverage ≠ Everything", () => {
    expect(morningNudgeDay(window14(["2026-07-06", "2026-07-08"]))).toBe(
      "2026-07-08",
    )
    const most: CoverageMap = new Map([["2026-07-08", "most"]])
    expect(morningNudgeDay(window14(["2026-07-08"], most))).toBe("2026-07-08")
  })

  it("is null once that Day is labelled Everything — nothing to revise", () => {
    const done: CoverageMap = new Map([["2026-07-08", "everything"]])
    expect(morningNudgeDay(window14(["2026-07-06", "2026-07-08"], done))).toBeNull()
  })

  it("never nudges about an older Day past the most recent closed one", () => {
    const done: CoverageMap = new Map([["2026-07-08", "everything"]])
    // 07-06 is unlabelled, but 07-08 is the last closed Day and it is settled.
    expect(morningNudgeDay(window14(["2026-07-06", "2026-07-08"], done))).toBeNull()
  })

  it("ignores today and empty windows", () => {
    expect(morningNudgeDay(window14([TODAY]))).toBeNull()
    expect(morningNudgeDay(window14([]))).toBeNull()
  })
})
