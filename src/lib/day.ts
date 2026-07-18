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

/**
 * The seven weekday initials, Sunday-first, in the given locale — the calendar
 * grid header (#34). 2023-01-01 is a Sunday, so offsetting from it walks the
 * week in order. The strip chips read their initials from `stripWindow` (which
 * formats per Day), so the two surfaces share the same Intl source.
 */
export function narrowWeekdays(locale: string = "en"): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" })
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(2023, 0, 1 + i))
  )
}

/** One Day's single-letter weekday in the locale — chart axis labels (#22). */
export function narrowWeekday(day: string, locale: string = "en"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
    parseDay(day)
  )
}

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
export function dayDiff(a: string, b: string): number {
  // Round to shrug off the ±1h a DST transition puts between two midnights.
  return Math.round(
    (parseDay(a).getTime() - parseDay(b).getTime()) / 86_400_000
  )
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
 * How far forward the strip follows a selection, mirroring the floor. Forward
 * navigation itself is unbounded — beyond the ceiling the selection simply
 * lives on the calendar button instead of a chip (#34).
 */
export const STRIP_FUTURE_DAYS = 14

/**
 * The strip's floor: the oldest Day it reaches, `STRIP_PAST_DAYS` before today.
 * The one home for the bound so the window's leading edge and the off-strip
 * predicate can never disagree.
 */
export function stripFloor(now: Date = new Date()): string {
  return stepDay(localDay(now), -STRIP_PAST_DAYS)
}

/** The strip's ceiling: the newest Day a chip can represent. */
export function stripCeiling(now: Date = new Date()): string {
  return stepDay(localDay(now), STRIP_FUTURE_DAYS)
}

/**
 * Whether a Day lies beyond the strip's reach on either side (#34). Off-strip,
 * no chip is filled and the calendar button carries the Day's date.
 */
export function isOffStrip(day: string, now: Date = new Date()): boolean {
  return day < stripFloor(now) || day > stripCeiling(now)
}

/**
 * The Day strip's window (#33): a today-anchored run from `STRIP_PAST_DAYS`
 * ago through today, plus the future frontier. The window never moves with a
 * past selection; selecting an on-strip future Day extends it, keeping exactly
 * one dashed frontier beyond the selection — tapping the frontier *is* the
 * frontier advance. An off-strip selection (either side, #34) leaves the
 * window in its unselected home state.
 */
export function stripWindow(
  selected: string,
  now: Date = new Date(),
  locale: string = "en"
): DayCell[] {
  const today = localDay(now)
  const first = stripFloor(now)
  const extendsStrip = selected > today && !isOffStrip(selected, now)
  const frontier = stepDay(extendsStrip ? selected : today, 1)
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

// ── The calendar's month axis (#34) ─────────────────────────────────────────
// A month is 'YYYY-MM'; like Days, months compare lexicographically and all
// arithmetic runs on calendar components, so paging is unbounded and DST-exact.

/** The 'YYYY-MM' month a Day belongs to. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

/** The month `delta` months from `month`, across year boundaries. */
export function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** The sheet header's name for a month, localized: "July 2026" / "julio de 2026". */
export function monthTitle(month: string, locale: string = "en"): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1, 1)
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(d)
}

export interface MonthCell {
  /** 'YYYY-MM-DD' — padding cells are the neighbor months' real Days. */
  day: string
  /** Day of month, 1–31. */
  dayNum: number
  /** False on the leading/trailing padding rows. */
  inMonth: boolean
}

/**
 * The calendar's month grid (#34): Sunday-first, always six rows (42 cells) so
 * the sheet never changes height while paging. Leading and trailing cells are
 * the neighbor months' Days, flagged out-of-month; state (today, selection,
 * logged dots) is the component's to overlay, keeping the grid pure.
 */
export function monthGrid(month: string): MonthCell[] {
  const [y, m] = month.split("-").map(Number)
  const lead = new Date(y, m - 1, 1).getDay() // cells before the 1st, Sunday-first
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(y, m - 1, 1 + i - lead)
    return {
      day: localDay(d),
      dayNum: d.getDate(),
      inMonth: d.getMonth() === m - 1,
    }
  })
}

/**
 * The calendar button's compact name for an off-strip Day: "1 Jul", with the
 * year appended only when it isn't the current one ("31 Dec 2025").
 */
export function shortDayLabel(
  day: string,
  now: Date = new Date(),
  locale: string = "en"
): string {
  const d = parseDay(day)
  // Day-before-month order, kept explicit so it reads the same across locales
  // (matches relativeDayLabel; a plain Intl date string would reorder per region).
  const base = `${d.getDate()} ${shortMonth(day, locale)}`
  return d.getFullYear() === now.getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`
}

/** A Day's short month name in the locale — "Jul" / "jul". Internal. */
function shortMonth(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(
    parseDay(day)
  )
}

/**
 * The week report pager's name for a 7-day window (#22): "27 Jun – 3 Jul",
 * collapsing a shared month to "1 – 7 Jul". Day-before-month order kept
 * explicit so it reads the same across locales (matches shortDayLabel).
 */
export function weekRangeLabel(
  start: string,
  end: string,
  locale: string = "en"
): string {
  const dayNum = (day: string) => parseDay(day).getDate()
  const sameMonth = monthOf(start) === monthOf(end)
  const from = sameMonth
    ? `${dayNum(start)}`
    : `${dayNum(start)} ${shortMonth(start, locale)}`
  return `${from} – ${dayNum(end)} ${shortMonth(end, locale)}`
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
  now: Date = new Date()
): string {
  const diff = dayDiff(day, localDay(now))
  if (diff === 0) return labels.today
  if (diff === -1) return labels.yesterday
  if (diff === 1) return labels.tomorrow
  const d = parseDay(day)
  // Day-before-month order, kept explicit so it reads the same across locales
  // (a plain Intl date string would reorder and add punctuation per region).
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    d
  )
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(d)
  return `${weekday} ${d.getDate()} ${month}`
}
