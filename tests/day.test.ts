// Seam: the pure day/date axis of the log (src/lib/day.ts). A Day is a
// device-local calendar date, 'YYYY-MM-DD' (CONTEXT.md). This is where V1's
// future-nav asymmetry and timezone/off-by-one edges get pinned (spec § V1
// failure classes) — so it is tested independently of any Firestore round-trip.
import { describe, expect, it } from "vitest"
import {
  isFuture,
  isToday,
  localDay,
  relativeDayLabel,
  stepDay,
  stepWithinStrip,
  stripWindow,
} from "@/lib/day"

// A fixed "now": Fri 2026-07-10, 09:30 local. Independent source of truth for
// every relative assertion below.
const NOW = new Date(2026, 6, 10, 9, 30)

describe("localDay", () => {
  it("formats a Date as its device-local 'YYYY-MM-DD'", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31")
  })
})

describe("stepDay", () => {
  it("moves forward and backward by whole days", () => {
    expect(stepDay("2026-07-10", 1)).toBe("2026-07-11")
    expect(stepDay("2026-07-10", -1)).toBe("2026-07-09")
    expect(stepDay("2026-07-10", 5)).toBe("2026-07-15")
  })

  it("crosses month and year boundaries", () => {
    expect(stepDay("2026-07-31", 1)).toBe("2026-08-01")
    expect(stepDay("2026-08-01", -1)).toBe("2026-07-31")
    expect(stepDay("2026-12-31", 1)).toBe("2027-01-01")
    expect(stepDay("2027-01-01", -1)).toBe("2026-12-31")
    expect(stepDay("2028-02-28", 1)).toBe("2028-02-29") // 2028 is a leap year
  })

  it("is an exact inverse across DST boundaries (no ms-drift bug)", () => {
    // Round-tripping must hold regardless of the machine's timezone; a
    // milliseconds-based implementation would land on the wrong date near a
    // spring-forward / fall-back transition. These straddle both UK switches.
    for (const day of ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25"]) {
      expect(stepDay(stepDay(day, 1), -1)).toBe(day)
      expect(stepDay(stepDay(day, -1), 1)).toBe(day)
    }
  })
})

describe("isToday / isFuture", () => {
  it("classify a Day against a reference moment", () => {
    expect(isToday("2026-07-10", NOW)).toBe(true)
    expect(isToday("2026-07-09", NOW)).toBe(false)
    expect(isFuture("2026-07-11", NOW)).toBe(true)
    expect(isFuture("2026-07-10", NOW)).toBe(false) // today is not future
    expect(isFuture("2026-07-09", NOW)).toBe(false)
  })
})

describe("stripWindow", () => {
  // The Day strip's window (#33): today-anchored, running from 14 days ago
  // through today plus exactly one dashed future frontier. The strip is the
  // sole day navigator — no older Days render, and the frontier is the only
  // future Day on show until it is deliberately stepped onto.
  it("runs from 14 days back through today plus one frontier", () => {
    const cells = stripWindow("2026-07-10", NOW)
    expect(cells).toHaveLength(16)
    expect(cells[0]).toMatchObject({ day: "2026-06-26", weekday: "F", dayNum: 26 })
    expect(cells[14]).toMatchObject({ day: "2026-07-10", weekday: "F", dayNum: 10 })
    expect(cells[15]).toMatchObject({ day: "2026-07-11", weekday: "S", dayNum: 11 })
    expect(cells[14]).toMatchObject({ isToday: true, isSelected: true })
    expect(cells[15]).toMatchObject({
      isFuture: true,
      isFrontier: true,
      isSelected: false,
    })
    expect(cells.filter((c) => c.isFrontier)).toHaveLength(1)
  })

  it("stays today-anchored when a past Day is selected", () => {
    const cells = stripWindow("2026-07-01", NOW)
    expect(cells).toHaveLength(16) // window unmoved: still 06-26 .. 07-11
    expect(cells[0].day).toBe("2026-06-26")
    expect(cells[15].day).toBe("2026-07-11")
    expect(cells.find((c) => c.isSelected)?.day).toBe("2026-07-01")
    expect(cells.find((c) => c.isToday)?.day).toBe("2026-07-10")
    expect(cells.find((c) => c.isToday)?.isSelected).toBe(false)
  })

  it("advances the frontier when the frontier Day is selected", () => {
    // Tapping the dashed frontier (Jul 11) selects it and reveals the next
    // future Day — the selected future Day is never the frontier itself.
    const cells = stripWindow("2026-07-11", NOW)
    expect(cells).toHaveLength(17)
    expect(cells[15]).toMatchObject({
      day: "2026-07-11",
      isSelected: true,
      isFuture: true,
      isFrontier: false,
    })
    expect(cells[16]).toMatchObject({
      day: "2026-07-12",
      isFrontier: true,
      isSelected: false,
    })
    expect(cells.filter((c) => c.isFrontier)).toHaveLength(1)
  })

  it("keeps one frontier beyond a selection several Days ahead", () => {
    const cells = stripWindow("2026-07-13", NOW) // three steps forward
    expect(cells[cells.length - 1].day).toBe("2026-07-14")
    expect(cells.filter((c) => c.isFrontier)).toHaveLength(1)
    // The skipped-over future Days are plain future cells, not frontiers.
    const between = cells.filter(
      (c) => c.isFuture && !c.isSelected && !c.isFrontier,
    )
    expect(between.map((c) => c.day)).toEqual(["2026-07-11", "2026-07-12"])
  })

  it("flags nothing when the selected Day is older than the strip", () => {
    const cells = stripWindow("2026-06-01", NOW) // deep Backfill (calendar's job)
    expect(cells[0].day).toBe("2026-06-26") // window unmoved, nothing older
    expect(cells.some((c) => c.isSelected)).toBe(false)
    expect(cells.filter((c) => c.isFrontier)).toHaveLength(1)
  })

  it("stays a run of consecutive Days across a DST transition", () => {
    // A window straddling the UK spring-forward (2026-03-29): every step is
    // exactly one calendar day — no hour-drift duplicates or gaps.
    const cells = stripWindow("2026-04-05", new Date(2026, 3, 5, 9, 0))
    expect(cells[0].day).toBe("2026-03-22")
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].day).toBe(stepDay(cells[i - 1].day, 1))
    }
  })
})

describe("stepWithinStrip", () => {
  // The log swipe's step (#33): bounded to the strip. It stops dead at the
  // 14-day floor (the calendar ticket lifts it) and, forward, advancing onto
  // the frontier is always allowed — that is the frontier advance.
  it("steps one Day either way inside the strip", () => {
    expect(stepWithinStrip("2026-07-05", -1, NOW)).toBe("2026-07-04")
    expect(stepWithinStrip("2026-07-05", 1, NOW)).toBe("2026-07-06")
  })

  it("returns null at the 14-day floor instead of stepping past it", () => {
    expect(stepWithinStrip("2026-06-26", -1, NOW)).toBeNull() // at the floor
    expect(stepWithinStrip("2026-06-27", -1, NOW)).toBe("2026-06-26") // onto it
  })

  it("always steps forward — swiping ahead advances the frontier", () => {
    expect(stepWithinStrip("2026-07-10", 1, NOW)).toBe("2026-07-11")
    expect(stepWithinStrip("2026-07-11", 1, NOW)).toBe("2026-07-12")
  })
})

describe("relativeDayLabel", () => {
  it("names the near Days relative to now", () => {
    expect(relativeDayLabel("2026-07-10", NOW)).toBe("Today")
    expect(relativeDayLabel("2026-07-09", NOW)).toBe("Yesterday")
    expect(relativeDayLabel("2026-07-11", NOW)).toBe("Tomorrow")
  })

  it("formats distant Days as weekday, day and month", () => {
    expect(relativeDayLabel("2026-07-07", NOW)).toBe("Tue 7 Jul")
    expect(relativeDayLabel("2026-12-31", NOW)).toBe("Thu 31 Dec")
  })
})
