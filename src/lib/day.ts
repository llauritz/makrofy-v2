// The pure day/date axis of the log. A Day is a device-local calendar date,
// 'YYYY-MM-DD' (CONTEXT.md § Day). All arithmetic runs on local calendar
// components — never millisecond offsets — so it is exact across DST and never
// drifts by an hour. Kept free of Firestore so it stays trivially testable and
// is the one home for the date edges V1 got wrong (future-nav asymmetry,
// off-by-one, timezone).

// Fixed English display tables. Locale-aware formatting arrives with i18n
// (#25); until then these keep labels deterministic and test-stable.
const WEEKDAY_NARROW = ["S", "M", "T", "W", "T", "F", "S"] as const
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

/** The device-local Day a moment belongs to, as 'YYYY-MM-DD'. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parse a Day string to a local Date at midnight. Internal. */
function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * The Day `delta` days from `day`. Advancing the day-of-month component lets
 * the Date constructor normalize month/year rollover, and — because we never
 * add a fixed span of milliseconds — the result is DST-exact.
 */
export function stepDay(day: string, delta: number): string {
  const d = parseDay(day)
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta))
}

/** Whole calendar days from `b` to `a` (positive when `a` is later). */
function dayDiff(a: string, b: string): number {
  // Round to shrug off the ±1h a DST transition puts between two midnights.
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86_400_000)
}

export function isToday(day: string, now: Date = new Date()): boolean {
  return day === localDay(now)
}

// 'YYYY-MM-DD' sorts lexicographically in chronological order, so a string
// compare is enough — no parsing needed.
export function isFuture(day: string, now: Date = new Date()): boolean {
  return day > localDay(now)
}

export interface DayCell {
  /** 'YYYY-MM-DD'. */
  day: string
  /** Single-letter weekday for the strip (S M T W T F S). */
  weekday: string
  /** Day of month, 1–31. */
  dayNum: number
  isToday: boolean
  isFuture: boolean
  isSelected: boolean
}

/**
 * The week strip's 7-day window: a stable run from five days ago through
 * tomorrow, anchored on *today* (index 5) so exactly one future day is always
 * visible (spec § Design direction). The window does not move with the
 * selection — `selected` only flags its cell, and on a deep Backfill it may
 * flag none (the day label carries the date instead). `logged` dots are
 * layered on by the caller from the entries listener, keeping this pure.
 */
export function weekWindow(selected: string, now: Date = new Date()): DayCell[] {
  const today = localDay(now)
  return Array.from({ length: 7 }, (_, i) => {
    const day = stepDay(today, i - 5)
    const d = parseDay(day)
    return {
      day,
      weekday: WEEKDAY_NARROW[d.getDay()],
      dayNum: d.getDate(),
      isToday: day === today,
      isFuture: isFuture(day, now),
      isSelected: day === selected,
    }
  })
}

/**
 * A short human name for a Day: "Today"/"Yesterday"/"Tomorrow" for the near
 * ones, else "Wed 8 Jul". Lets the selected Day stay legible even when it has
 * slid out of the week strip on a deep Backfill.
 */
export function relativeDayLabel(day: string, now: Date = new Date()): string {
  const diff = dayDiff(day, localDay(now))
  if (diff === 0) return "Today"
  if (diff === -1) return "Yesterday"
  if (diff === 1) return "Tomorrow"
  const d = parseDay(day)
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}
