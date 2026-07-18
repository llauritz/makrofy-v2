// Seam: the stats core (issue #22) — pure day-total building, Coverage-gated
// admission (ADR 0006) and the aggregate maths behind the dashboard, week
// report and morning strip. Charts render whatever this admits; every
// normative rule from #22 is pinned here, not in components.
import { describe, expect, it } from "vitest"
import type { CoverageMap } from "@/data/days"
import { weekRangeLabel } from "@/lib/day"
import {
  averageKcal,
  dayShare,
  deltaPct,
  earliestDay,
  inRangeWeek,
  maxWeekOffset,
  rangeBounds,
  rolling7,
  statDays,
  weekMacroShare,
  weekSummary,
  weekWindow,
} from "@/lib/stats"

// A minimal Entry row — stats reads only date + nutrients.
const entry = (
  date: string,
  kcal: number,
  macros: { protein?: number; fat?: number; carbs?: number } = {}
) => ({ date, kcal, ...macros })

const TODAY = "2026-07-10" // Fri

const none: CoverageMap = new Map()

describe("statDays", () => {
  it("builds the inclusive window with untracked days as null, never zero", () => {
    const days = statDays(
      [entry("2026-07-08", 500)],
      none,
      "2026-07-06",
      TODAY,
      TODAY
    )
    expect(days.map((d) => d.day)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ])
    expect(days[2].kcal).toBe(500)
    expect(days[1].kcal).toBeNull()
  })

  it("sums a Day's Entries — kcal and macros, absent macros as 0", () => {
    const days = statDays(
      [
        entry("2026-07-08", 300, { protein: 10, fat: 5 }),
        entry("2026-07-08", 200, { protein: 2, carbs: 30 }),
      ],
      none,
      "2026-07-08",
      "2026-07-08",
      TODAY
    )
    expect(days[0]).toMatchObject({ kcal: 500, protein: 12, fat: 5, carbs: 30 })
  })

  it("ignores Entries outside the window", () => {
    const days = statDays(
      [entry("2026-07-01", 999)],
      none,
      "2026-07-06",
      TODAY,
      TODAY
    )
    expect(days.every((d) => d.kcal === null)).toBe(true)
  })

  it("carries Coverage, today and future flags", () => {
    const labels: CoverageMap = new Map([["2026-07-09", "some"]])
    const days = statDays(
      [entry("2026-07-09", 400), entry("2026-07-10", 600)],
      labels,
      "2026-07-09",
      "2026-07-11",
      TODAY
    )
    expect(days[0].coverage).toBe("some")
    expect(days[1]).toMatchObject({ coverage: null, isToday: true })
    expect(days[2].isFuture).toBe(true)
  })
})

describe("averageKcal — tracked days only, Coverage gates admission", () => {
  it("averages tracked days and skips gaps", () => {
    const days = statDays(
      [entry("2026-07-06", 2000), entry("2026-07-08", 1000)],
      none,
      "2026-07-04",
      "2026-07-09",
      TODAY
    )
    expect(averageKcal(days)).toBe(1500)
  })

  it("excludes today — the day never counts until it completes", () => {
    const days = statDays(
      [entry("2026-07-09", 2000), entry(TODAY, 100)],
      none,
      "2026-07-09",
      TODAY,
      TODAY
    )
    expect(averageKcal(days)).toBe(2000)
  })

  it("excludes a *Some* Day from the aggregate; *Most* still counts", () => {
    const labels: CoverageMap = new Map([
      ["2026-07-07", "some"],
      ["2026-07-08", "most"],
    ])
    const days = statDays(
      [
        entry("2026-07-07", 100),
        entry("2026-07-08", 1000),
        entry("2026-07-09", 2000),
      ],
      labels,
      "2026-07-07",
      "2026-07-09",
      TODAY
    )
    expect(averageKcal(days)).toBe(1500)
  })

  it("is null when nothing is admitted", () => {
    const days = statDays([entry(TODAY, 500)], none, "2026-07-09", TODAY, TODAY)
    expect(averageKcal(days)).toBeNull()
  })
})

describe("deltaPct", () => {
  it("is the rounded percent change vs the week before", () => {
    expect(deltaPct(1976, 2410)).toBe(-18)
    expect(deltaPct(2413, 2255)).toBe(7)
  })

  it("is null when either window has no average", () => {
    expect(deltaPct(null, 2000)).toBeNull()
    expect(deltaPct(2000, null)).toBeNull()
  })
})

describe("rolling7", () => {
  it("averages the trailing 7 admitted days at each position", () => {
    // 8 tracked days, 1000..8000 — at the last day the window is 2000..8000.
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry(`2026-07-0${i + 1}`, (i + 1) * 1000)
    )
    const days = statDays(entries, none, "2026-07-01", "2026-07-08", TODAY)
    const out = rolling7(days)
    expect(out).toHaveLength(8)
    expect(out[7]).toBe(5000) // mean of 2000..8000
    expect(out[0]).toBe(1000) // partial lead-in: just the first day
  })

  it("is null where the trailing window holds no admitted day", () => {
    const days = statDays([], none, "2026-07-01", "2026-07-03", TODAY)
    expect(rolling7(days)).toEqual([null, null, null])
  })

  it("skips *Some* days inside the window", () => {
    const labels: CoverageMap = new Map([["2026-07-02", "some"]])
    const days = statDays(
      [
        entry("2026-07-01", 1000),
        entry("2026-07-02", 9000),
        entry("2026-07-03", 2000),
      ],
      labels,
      "2026-07-01",
      "2026-07-03",
      TODAY
    )
    expect(rolling7(days)[2]).toBe(1500)
  })
})

describe("in range — 80–110% of Goal, gated on assessable days", () => {
  const goal = 2200

  it("bounds round from the goal", () => {
    expect(rangeBounds(goal)).toEqual({ lo: 1760, hi: 2420 })
  })

  it("classifies each day into a dot state", () => {
    const labels: CoverageMap = new Map([
      ["2026-07-06", "some"],
      ["2026-07-07", "most"],
    ])
    const days = statDays(
      [
        entry("2026-07-04", 2000), // in
        entry("2026-07-05", 3000), // out
        entry("2026-07-06", 2000), // some → distinct marker
        entry("2026-07-07", 2000), // most → not assessable
        entry(TODAY, 400), // today → small forming dot
      ],
      labels,
      "2026-07-04",
      TODAY,
      TODAY
    )
    const week = inRangeWeek(days, goal)
    expect(week.dots.map((d) => d.state)).toEqual([
      "in",
      "out",
      "some",
      "most",
      "gap",
      "gap",
      "today",
    ])
  })

  it("needs a full 7-day window with ≥5 assessable days", () => {
    const five = statDays(
      Array.from({ length: 5 }, (_, i) => entry(`2026-07-0${i + 4}`, 2000)),
      none,
      "2026-07-04",
      TODAY,
      TODAY
    )
    expect(inRangeWeek(five, goal)).toMatchObject({
      enough: true,
      inRange: 5,
      assessable: 5,
    })

    const four = statDays(
      Array.from({ length: 4 }, (_, i) => entry(`2026-07-0${i + 4}`, 2000)),
      none,
      "2026-07-04",
      TODAY,
      TODAY
    )
    expect(inRangeWeek(four, goal).enough).toBe(false)
  })

  it("a *Most* Day is not assessable — it can push the band away", () => {
    const labels: CoverageMap = new Map([["2026-07-04", "most"]])
    const days = statDays(
      Array.from({ length: 5 }, (_, i) => entry(`2026-07-0${i + 4}`, 2000)),
      labels,
      "2026-07-04",
      TODAY,
      TODAY
    )
    expect(inRangeWeek(days, goal)).toMatchObject({
      enough: false,
      assessable: 4,
    })
  })

  it("a partial window at the data edge is never enough, even with 5 assessable days", () => {
    const days = statDays(
      Array.from({ length: 5 }, (_, i) => entry(`2026-07-0${i + 5}`, 2000)),
      none,
      "2026-07-05",
      "2026-07-09",
      TODAY
    )
    expect(days).toHaveLength(5)
    const week = inRangeWeek(days, goal)
    expect(week.assessable).toBe(5)
    expect(week.enough).toBe(false)
  })

  it("future days get no mark — not even a gap", () => {
    const days = statDays(
      [entry(TODAY, 500)],
      none,
      "2026-07-09",
      "2026-07-11",
      TODAY
    )
    expect(inRangeWeek(days, goal).dots.map((d) => d.state)).toEqual([
      "gap",
      "today",
      "future",
    ])
  })

  it("tolerates a zero goal without NaN", () => {
    const days = statDays(
      [entry("2026-07-09", 2000)],
      none,
      "2026-07-09",
      TODAY,
      TODAY
    )
    const week = inRangeWeek(days, 0)
    expect(week.enough).toBe(false)
    expect(week.inRange).toBe(0)
  })
})

describe("macro share of calories", () => {
  it("splits a day by P4/F9/C4 calories", () => {
    const days = statDays(
      [entry("2026-07-09", 800, { protein: 50, fat: 20, carbs: 55 })],
      none,
      "2026-07-09",
      "2026-07-09",
      TODAY
    )
    const share = dayShare(days[0])
    // P 200, F 180, C 220 of 600 macro kcal
    expect(share).not.toBeNull()
    expect(share!.p).toBeCloseTo(200 / 600)
    expect(share!.f).toBeCloseTo(180 / 600)
    expect(share!.c).toBeCloseTo(220 / 600)
  })

  it("is null for untracked days and days without macros", () => {
    const days = statDays(
      [entry("2026-07-09", 500)],
      none,
      "2026-07-08",
      "2026-07-09",
      TODAY
    )
    expect(dayShare(days[0])).toBeNull()
    expect(dayShare(days[1])).toBeNull()
  })

  it("week average skips today and *Some* days", () => {
    const labels: CoverageMap = new Map([["2026-07-08", "some"]])
    const days = statDays(
      [
        entry("2026-07-07", 400, { protein: 100 }), // all protein
        entry("2026-07-08", 400, { carbs: 100 }), // some → excluded
        entry(TODAY, 400, { fat: 44 }), // today → excluded
      ],
      labels,
      "2026-07-07",
      TODAY,
      TODAY
    )
    const avg = weekMacroShare(days)
    expect(avg).not.toBeNull()
    expect(avg!.p).toBeCloseTo(1)
    expect(avg!.c).toBeCloseTo(0)
  })

  it("week average is null with no admitted macro days", () => {
    const days = statDays(
      [entry(TODAY, 400, { fat: 10 })],
      none,
      "2026-07-09",
      TODAY,
      TODAY
    )
    expect(weekMacroShare(days)).toBeNull()
  })
})

describe("weekSummary", () => {
  it("bundles the last-7-days reading: average, delta vs the prior week, range", () => {
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => entry(stepBack(13 - i), 1000)),
      ...Array.from({ length: 6 }, (_, i) => entry(stepBack(6 - i), 2000)),
    ]
    const days = statDays(entries, none, stepBack(13), TODAY, TODAY)
    const summary = weekSummary(days, 2200)
    expect(summary.week.map((d) => d.day)).toEqual(
      Array.from({ length: 7 }, (_, i) => stepBack(6 - i))
    )
    expect(summary.avg).toBe(2000)
    expect(summary.delta).toBe(100)
    expect(summary.range.enough).toBe(true)
    expect(summary.range.inRange).toBe(6)
  })
})

// The Day `n` days before TODAY, for windows that straddle a month boundary.
function stepBack(n: number): string {
  const d = new Date(2026, 6, 10 - n)
  const pad = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe("week paging", () => {
  it("offset 0 is the trailing 7 days ending today", () => {
    expect(weekWindow(0, TODAY)).toEqual({ start: "2026-07-04", end: TODAY })
  })

  it("each offset steps a whole week back", () => {
    expect(weekWindow(2, TODAY)).toEqual({
      start: "2026-06-20",
      end: "2026-06-26",
    })
  })

  it("maxWeekOffset reaches the earliest Entry and no further", () => {
    expect(maxWeekOffset("2026-07-04", TODAY)).toBe(0)
    expect(maxWeekOffset("2026-07-03", TODAY)).toBe(1)
    expect(maxWeekOffset("2026-05-01", TODAY)).toBe(10)
    expect(maxWeekOffset(null, TODAY)).toBe(0)
  })

  it("earliestDay finds the oldest Entry date", () => {
    expect(earliestDay([entry("2026-07-08", 1), entry("2026-06-30", 1)])).toBe(
      "2026-06-30"
    )
    expect(earliestDay([])).toBeNull()
  })

  it("labels a window compactly, collapsing a shared month", () => {
    expect(weekRangeLabel("2026-06-27", "2026-07-03", "en")).toBe(
      "27 Jun – 3 Jul"
    )
    expect(weekRangeLabel("2026-07-01", "2026-07-07", "en")).toBe("1 – 7 Jul")
  })
})
