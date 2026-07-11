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
  weekWindow,
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

describe("weekWindow", () => {
  // The window is anchored on *today*, not the selection: a stable 7-day strip
  // running from five days ago through tomorrow, so exactly one future day is
  // always on show (spec § Design direction). The selection only flags a cell.
  it("is a stable today-anchored 7-day window ending one day ahead", () => {
    const cells = weekWindow("2026-07-10", NOW)
    expect(cells).toHaveLength(7)
    expect(cells.map((c) => c.day)).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10", // today — always the 6th slot
      "2026-07-11", // the single future day
    ])
    expect(cells.find((c) => c.isToday)?.day).toBe("2026-07-10")
    expect(cells.filter((c) => c.isFuture)).toHaveLength(1)
    expect(cells[6].isFuture).toBe(true)
  })

  it("marks the selected Day within the window without moving it", () => {
    const cells = weekWindow("2026-07-08", NOW) // viewing two days ago
    // Window is unchanged — still today-anchored.
    expect(cells[0].day).toBe("2026-07-05")
    expect(cells[6].day).toBe("2026-07-11")
    expect(cells.filter((c) => c.isSelected)).toHaveLength(1)
    expect(cells.find((c) => c.isSelected)?.day).toBe("2026-07-08")
    expect(cells.find((c) => c.isToday)?.day).toBe("2026-07-10") // today still shown
  })

  it("flags nothing when the selected Day has slid out of the window", () => {
    const cells = weekWindow("2026-06-28", NOW) // a deep Backfill
    expect(cells[0].day).toBe("2026-07-05") // window unmoved
    expect(cells.some((c) => c.isSelected)).toBe(false)
    expect(cells.filter((c) => c.isFuture)).toHaveLength(1) // invariant holds
  })

  it("carries a display weekday letter and day-of-month for each cell", () => {
    const cells = weekWindow("2026-07-10", NOW)
    expect(cells[0]).toMatchObject({ weekday: "S", dayNum: 5 }) // Sunday
    expect(cells[5]).toMatchObject({ weekday: "F", dayNum: 10 }) // Friday
    expect(cells[6]).toMatchObject({ weekday: "S", dayNum: 11 }) // Saturday
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
