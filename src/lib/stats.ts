import type { CoverageLevel, CoverageMap } from "@/data/days"
import { dayDiff, stepDay } from "@/lib/day"

// The stats core (issue #22): pure day-total building and the aggregate maths
// behind the dashboard, week report and morning strip. Firestore-free — the
// hooks feed it Entries and Coverage labels; charts render what it admits.
//
// The normative rules live here, not in components:
//   - untracked days are gaps (kcal null), never zeros, and averages run over
//     tracked days only;
//   - today never counts until the day completes; future days get no marks;
//   - Coverage gates admission and never re-weights a Day's numbers
//     (ADR 0006): *Some* is excluded from every aggregate, *Most* counts
//     everywhere except the in-range measure, *Everything*/unlabelled count
//     fully.

/** The slice of an Entry the stats read — date plus nutrients. */
export interface StatEntry {
  date: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/** One calendar Day of the stats window, totalled and flagged for admission. */
export interface StatDay {
  /** 'YYYY-MM-DD'. */
  day: string
  /** Total logged kcal; null = untracked (a gap, never a zero). */
  kcal: number | null
  protein: number
  fat: number
  carbs: number
  /** The Day's Coverage label; null = unlabelled (trusted, counts fully). */
  coverage: CoverageLevel | null
  isToday: boolean
  isFuture: boolean
}

/**
 * Total every Day of the inclusive `start`..`end` window from the Entry
 * history. Days without Entries stay in the array as gaps so charts keep
 * their calendar slots; Entries outside the window are ignored.
 */
export function statDays(
  entries: readonly StatEntry[],
  coverage: CoverageMap,
  start: string,
  end: string,
  today: string,
): StatDay[] {
  const totals = new Map<
    string,
    { kcal: number; protein: number; fat: number; carbs: number }
  >()
  for (const e of entries) {
    if (e.date < start || e.date > end) continue
    const t = totals.get(e.date) ?? { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    t.kcal += e.kcal
    t.protein += e.protein ?? 0
    t.fat += e.fat ?? 0
    t.carbs += e.carbs ?? 0
    totals.set(e.date, t)
  }
  const length = dayDiff(end, start) + 1
  return Array.from({ length }, (_, i) => {
    const day = stepDay(start, i)
    const t = totals.get(day)
    return {
      day,
      kcal: t ? t.kcal : null,
      protein: t?.protein ?? 0,
      fat: t?.fat ?? 0,
      carbs: t?.carbs ?? 0,
      coverage: coverage.get(day) ?? null,
      isToday: day === today,
      isFuture: day > today,
    }
  })
}

/**
 * Whether a Day counts in averages, trends and week columns: tracked, closed
 * (not today or future) and not flagged *Some*. The only admission gate most
 * aggregates need.
 */
export function countsInAverages(d: StatDay): boolean {
  return d.kcal !== null && !d.isToday && !d.isFuture && d.coverage !== "some"
}

/**
 * Whether a Day can be judged against the 80–110% band: admitted *and* not
 * *Most* — precision can't be judged on a Day known to be under-logged.
 */
export function isAssessable(d: StatDay): boolean {
  return countsInAverages(d) && d.coverage !== "most"
}

/** Mean kcal over the admitted days, rounded; null when none are admitted. */
export function averageKcal(days: readonly StatDay[]): number | null {
  const admitted = days.filter(countsInAverages)
  if (admitted.length === 0) return null
  return Math.round(
    admitted.reduce((sum, d) => sum + (d.kcal as number), 0) / admitted.length,
  )
}

/** Rounded % change of `current` vs `previous`; null when either is missing. */
export function deltaPct(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * The trailing-7-day average at each position — the trend chart's ink line.
 * Positions whose window admits no day are null (a gap). The caller supplies
 * lead-in days before the drawn window and slices them off the result.
 */
export function rolling7(days: readonly StatDay[]): (number | null)[] {
  return days.map((_, i) => averageKcal(days.slice(Math.max(0, i - 6), i + 1)))
}

/** The in-range band: 80–110% of Goal, rounded to whole kcal. */
export function rangeBounds(goalKcal: number): { lo: number; hi: number } {
  return { lo: Math.round(goalKcal * 0.8), hi: Math.round(goalKcal * 1.1) }
}

/**
 * A day's mark in the in-range dot row. 'in'/'out' are assessable verdicts;
 * the rest say why there is no verdict: a gap (untracked), today (still
 * forming), *Some* (excluded, drawn distinct from a gap), *Most* (counted in
 * averages but not judgeable against the band).
 */
export type RangeDotState = "in" | "out" | "gap" | "today" | "some" | "most"

export interface RangeDot {
  day: string
  state: RangeDotState
}

export interface InRangeWeek {
  /** The band appears only for a full 7-day window with ≥5 assessable days. */
  enough: boolean
  /** Assessable days that landed inside the band. */
  inRange: number
  /** Days a verdict exists for — Coverage Everything/unlabelled, tracked, closed. */
  assessable: number
  dots: RangeDot[]
}

/** Judge one window (typically 7 days) against the Goal's in-range band. */
export function inRangeWeek(
  days: readonly StatDay[],
  goalKcal: number,
): InRangeWeek {
  const { lo, hi } = rangeBounds(goalKcal)
  const dots: RangeDot[] = days.map((d) => ({ day: d.day, state: dotState(d, lo, hi) }))
  const assessable = dots.filter((d) => d.state === "in" || d.state === "out").length
  return {
    enough: goalKcal > 0 && days.length === 7 && assessable >= 5,
    inRange: dots.filter((d) => d.state === "in").length,
    assessable,
    dots,
  }
}

function dotState(d: StatDay, lo: number, hi: number): RangeDotState {
  if (d.isToday) return "today"
  if (d.kcal === null || d.isFuture) return "gap"
  if (d.coverage === "some") return "some"
  if (d.coverage === "most") return "most"
  return d.kcal >= lo && d.kcal <= hi ? "in" : "out"
}

/** A macro split as fractions of macro calories; p + f + c = 1. */
export interface MacroShare {
  p: number
  f: number
  c: number
}

/**
 * One Day's share of calories by macro (P and C at 4 kcal/g, F at 9) — the
 * stacked column's segments. Null when the Day is untracked or logged no
 * macros at all (nothing to stack).
 */
export function dayShare(d: StatDay): MacroShare | null {
  if (d.kcal === null) return null
  const p = d.protein * 4
  const f = d.fat * 9
  const c = d.carbs * 4
  const total = p + f + c
  if (total === 0) return null
  return { p: p / total, f: f / total, c: c / total }
}

/**
 * The week-average macro share for the legend: the mean of per-day shares over
 * admitted macro days (so each day weighs equally, matching the columns).
 */
export function weekMacroShare(days: readonly StatDay[]): MacroShare | null {
  const shares = days.filter(countsInAverages).map(dayShare).filter(
    (s): s is MacroShare => s !== null,
  )
  if (shares.length === 0) return null
  const sum = shares.reduce(
    (acc, s) => ({ p: acc.p + s.p, f: acc.f + s.f, c: acc.c + s.c }),
    { p: 0, f: 0, c: 0 },
  )
  return { p: sum.p / shares.length, f: sum.f / shares.length, c: sum.c / shares.length }
}

/**
 * The week report's paging axis: trailing 7-day windows, `offset` whole weeks
 * back from the window that ends today (offset 0).
 */
export function weekWindow(
  offset: number,
  today: string,
): { start: string; end: string } {
  const end = stepDay(today, -offset * 7)
  return { start: stepDay(end, -6), end }
}

/**
 * The oldest reachable pager offset — the window that still contains the
 * earliest Entry. 0 when there is no history to page into.
 */
export function maxWeekOffset(earliest: string | null, today: string): number {
  if (earliest === null || earliest >= today) return 0
  return Math.floor(dayDiff(today, earliest) / 7)
}

/** The oldest Entry date in the history; null when it is empty. */
export function earliestDay(entries: readonly StatEntry[]): string | null {
  let min: string | null = null
  for (const e of entries) {
    if (min === null || e.date < min) min = e.date
  }
  return min
}

/**
 * The pager pill's name for a past window: "27 Jun – 3 Jul", collapsing a
 * shared month to "1 – 7 Jul". Day-before-month order kept explicit so it
 * reads the same across locales (matching shortDayLabel in day.ts).
 */
export function weekRangeLabel(
  start: string,
  end: string,
  locale: string,
): string {
  const month = (day: string) => {
    const [y, m, d] = day.split("-").map(Number)
    return new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(y, m - 1, d),
    )
  }
  const dayNum = (day: string) => Number(day.slice(8))
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const from = sameMonth ? `${dayNum(start)}` : `${dayNum(start)} ${month(start)}`
  return `${from} – ${dayNum(end)} ${month(end)}`
}
