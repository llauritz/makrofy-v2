// Seam: the pure day/date axis of the log (src/lib/day.ts). A Day is a
// device-local calendar date, 'YYYY-MM-DD' (CONTEXT.md). This is where V1's
// future-nav asymmetry and timezone/off-by-one edges get pinned (spec § V1
// failure classes) — so it is tested independently of any Firestore round-trip.
import { describe, expect, it } from "vitest"
import {
  isFuture,
  isOffStrip,
  isToday,
  localDay,
  monthGrid,
  monthOf,
  monthTitle,
  relativeDayLabel,
  shortDayLabel,
  stepDay,
  stepMonth,
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

  it("collapses to the base window when the selection is far-future (off-strip)", () => {
    // A calendar jump months ahead must not stretch the strip into a hundred
    // chips — beyond the 14-day ceiling the selection lives on the calendar
    // button (#34) and the strip shows its unselected home state.
    const cells = stripWindow("2026-09-01", NOW)
    expect(cells[0].day).toBe("2026-06-26")
    expect(cells[cells.length - 1].day).toBe("2026-07-11") // today + one frontier
    expect(cells.some((c) => c.isSelected)).toBe(false)
    expect(cells.filter((c) => c.isFrontier)).toHaveLength(1)
  })

  it("still extends to a selection at the 14-day ceiling", () => {
    const cells = stripWindow("2026-07-24", NOW) // today + 14: last on-strip Day
    expect(cells.find((c) => c.isSelected)?.day).toBe("2026-07-24")
    // One frontier still sits beyond it; stepping onto it goes off-strip.
    expect(cells[cells.length - 1]).toMatchObject({
      day: "2026-07-25",
      isFrontier: true,
    })
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

describe("isOffStrip", () => {
  // The strip's reach (#34): 14 Days back through 14 Days forward. Outside it
  // no chip renders the selection — the calendar button carries the date.
  it("is false everywhere the strip reaches", () => {
    expect(isOffStrip("2026-06-26", NOW)).toBe(false) // the floor
    expect(isOffStrip("2026-07-10", NOW)).toBe(false) // today
    expect(isOffStrip("2026-07-24", NOW)).toBe(false) // the ceiling
  })

  it("is true past either edge", () => {
    expect(isOffStrip("2026-06-25", NOW)).toBe(true) // one below the floor
    expect(isOffStrip("2026-07-25", NOW)).toBe(true) // one past the ceiling
    expect(isOffStrip("2025-01-01", NOW)).toBe(true) // deep Backfill
    expect(isOffStrip("2027-01-01", NOW)).toBe(true) // far future
  })
})

describe("monthOf / stepMonth / monthTitle", () => {
  // The calendar's month axis (#34): 'YYYY-MM' pages, unbounded either way.
  it("names the month a Day belongs to", () => {
    expect(monthOf("2026-07-10")).toBe("2026-07")
    expect(monthOf("2025-12-31")).toBe("2025-12")
  })

  it("pages months across year boundaries", () => {
    expect(stepMonth("2026-07", 1)).toBe("2026-08")
    expect(stepMonth("2026-07", -1)).toBe("2026-06")
    expect(stepMonth("2026-12", 1)).toBe("2027-01")
    expect(stepMonth("2026-01", -1)).toBe("2025-12")
    expect(stepMonth("2026-07", -19)).toBe("2024-12")
  })

  it("titles a month for the sheet header", () => {
    expect(monthTitle("2026-07")).toBe("July 2026")
    expect(monthTitle("2025-01")).toBe("January 2025")
  })
})

describe("monthGrid", () => {
  // The month-grid generator (#34): Sunday-first, always six rows (42 cells)
  // so the sheet never changes height while paging; the padding cells are the
  // neighbor months' real Days, flagged out-of-month.
  it("lays July 2026 out with its neighbors as padding", () => {
    const cells = monthGrid("2026-07")
    expect(cells).toHaveLength(42)
    // Jul 1 2026 is a Wednesday: Sun Jun 28 leads the grid.
    expect(cells[0]).toMatchObject({ day: "2026-06-28", dayNum: 28, inMonth: false })
    expect(cells[3]).toMatchObject({ day: "2026-07-01", dayNum: 1, inMonth: true })
    expect(cells[33]).toMatchObject({ day: "2026-07-31", dayNum: 31, inMonth: true })
    expect(cells[41]).toMatchObject({ day: "2026-08-08", inMonth: false })
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31)
  })

  it("pads a Sunday-start month to six rows too", () => {
    // Feb 2026 starts on a Sunday and spans exactly four rows on its own.
    const cells = monthGrid("2026-02")
    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({ day: "2026-02-01", inMonth: true })
    expect(cells[27]).toMatchObject({ day: "2026-02-28", inMonth: true })
    expect(cells[41]).toMatchObject({ day: "2026-03-14", inMonth: false })
  })

  it("stays a run of consecutive Days across a DST transition", () => {
    // March 2026 contains the UK spring-forward (2026-03-29).
    const cells = monthGrid("2026-03")
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].day).toBe(stepDay(cells[i - 1].day, 1))
    }
  })
})

describe("shortDayLabel", () => {
  // The calendar button's off-strip label (#34): compact, year only when it
  // isn't this year.
  it("labels a Day of the current year as day + month", () => {
    expect(shortDayLabel("2026-07-01", NOW)).toBe("1 Jul")
    expect(shortDayLabel("2026-12-25", NOW)).toBe("25 Dec")
  })

  it("appends the year when it differs from now's", () => {
    expect(shortDayLabel("2025-12-31", NOW)).toBe("31 Dec 2025")
    expect(shortDayLabel("2027-01-01", NOW)).toBe("1 Jan 2027")
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
