// The pure day/date axis of the log. A Day is a device-local calendar date,
// 'YYYY-MM-DD' (CONTEXT.md § Day). All arithmetic runs on local calendar
// components — never millisecond offsets — so it is exact across DST and never
// drifts by an hour. Kept free of Firestore so it stays trivially testable and
// is the one home for the date edges V1 got wrong (future-nav asymmetry,
// off-by-one, timezone).

// Display labels are locale-aware via Intl (spec § i18n, #25): the caller
// passes the active language's locale, defaulting to English. Only the display
// helpers take a locale — the date arithmetic is pure calendar maths and never
// touches formatting.

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
  /** The one dashed future Day at the window's forward edge. */
  isFrontier: boolean
}

/** How far back the Day strip reaches; older Days are the calendar's job. */
export const STRIP_PAST_DAYS = 14

/**
 * The strip's floor: the oldest Day it reaches, `STRIP_PAST_DAYS` before today.
 * The one home for the bound so the window's leading edge and the swipe's guard
 * can never disagree (#34 lifts it for the calendar).
 */
export function stripFloor(now: Date = new Date()): string {
  return stepDay(localDay(now), -STRIP_PAST_DAYS)
}

/**
 * The Day strip's window (#33): a today-anchored run from `STRIP_PAST_DAYS`
 * ago through today, plus the future frontier. The window never moves with a
 * past selection; selecting a future Day extends it, keeping exactly one
 * dashed frontier beyond the selection — tapping the frontier *is* the
 * frontier advance.
 */
export function stripWindow(
  selected: string,
  now: Date = new Date(),
  locale: string = "en",
): DayCell[] {
  const today = localDay(now)
  const first = stripFloor(now)
  const frontier = stepDay(selected > today ? selected : today, 1)
  const length = dayDiff(frontier, first) + 1
  const narrowWeekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" })
  return Array.from({ length }, (_, i) => {
    const day = stepDay(first, i)
    const d = parseDay(day)
    return {
      day,
      weekday: narrowWeekday.format(d),
      dayNum: d.getDate(),
      isToday: day === today,
      isFuture: day > today,
      isSelected: day === selected,
      isFrontier: day === frontier,
    }
  })
}

/**
 * The swipe's step, bounded to the strip (#33): null below the 14-day floor
 * (deep Backfill is the calendar's job), always legal forward — stepping onto
 * the frontier is how a swipe advances it.
 */
export function stepWithinStrip(
  day: string,
  delta: -1 | 1,
  now: Date = new Date(),
): string | null {
  const next = stepDay(day, delta)
  return next < stripFloor(now) ? null : next
}

/** The near-day words relativeDayLabel needs, from the active dictionary (#25). */
export interface RelativeDayLabels {
  today: string
  yesterday: string
  tomorrow: string
}

/**
 * A short human name for a Day: the near ones as the given words
 * (Today/Yesterday/Tomorrow), else weekday-day-month in the locale ("Wed 8
 * Jul" / "mié 8 jul"). Lets the selected Day stay legible even when it has slid
 * off the Day strip on a deep Backfill (the calendar button's label, #34). The
 * words and locale come from the caller's i18n context, so day.ts stays free of
 * the dictionary itself.
 */
export function relativeDayLabel(
  day: string,
  labels: RelativeDayLabels,
  locale: string,
  now: Date = new Date(),
): string {
  const diff = dayDiff(day, localDay(now))
  if (diff === 0) return labels.today
  if (diff === -1) return labels.yesterday
  if (diff === 1) return labels.tomorrow
  const d = parseDay(day)
  // Day-before-month order, kept explicit so it reads the same across locales
  // (a plain Intl date string would reorder and add punctuation per region).
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d)
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(d)
  return `${weekday} ${d.getDate()} ${month}`
}
