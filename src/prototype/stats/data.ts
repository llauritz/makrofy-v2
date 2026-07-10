// PROTOTYPE — issue #7. Deterministic mock day history for the stats screens.
// Rules under evaluation are encoded here so the mocks show them honestly:
//   - untracked days are `null` kcal — gaps in charts, excluded from averages
//   - future days simply don't exist in DAYS (charts render empty slots)
//   - today (2026-07-10) is partial: the day is still in progress
export const GOAL_KCAL = 2200

// "In range" — the proposed replacement for V1's streak/best-day: a day whose
// total lands within 80–110% of the goal. Band is itself up for reaction.
export const RANGE_LO = Math.round(GOAL_KCAL * 0.8)
export const RANGE_HI = Math.round(GOAL_KCAL * 1.1)

export type Day = {
  date: Date
  kcal: number | null // null = untracked
  p: number
  f: number
  c: number
  today?: boolean
}

// Stable pseudo-noise so every reload shows the same "history".
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453
  return x - Math.floor(x)
}

export const TODAY = new Date(2026, 6, 10) // Fri 10 Jul 2026

function makeDays(): Day[] {
  const days: Day[] = []
  const start = new Date(2026, 5, 4) // 4 Jun — 7d of lead-in before the 30d trend window
  for (let d = new Date(start), i = 0; d <= TODAY; d.setDate(d.getDate() + 1), i++) {
    const date = new Date(d)
    const isToday = d.getTime() === TODAY.getTime()
    const untracked = !isToday && (noise(i) > 0.9 || (d.getMonth() === 6 && d.getDate() === 7)) // Jul 7 matches the shell's week strip
    const drift = 320 * Math.sin(i / 3.1) + 430 * (noise(i * 7 + 3) - 0.5)
    const kcal = isToday
      ? 1100 // partial: matches the seed entries on the main screen
      : untracked
        ? null
        : Math.round(Math.min(2750, Math.max(1480, GOAL_KCAL + drift)) / 10) * 10
    const base = kcal ?? 0
    // grams from a drifting split (P 22–30%, F 28–36%, C balance) of calories
    const pShare = 0.22 + 0.08 * noise(i * 13 + 5)
    const fShare = 0.28 + 0.08 * noise(i * 17 + 9)
    days.push({
      date,
      kcal,
      p: Math.round((base * pShare) / 4),
      f: Math.round((base * fShare) / 9),
      c: Math.round((base * (1 - pShare - fShare)) / 4),
      today: isToday || undefined,
    })
  }
  return days
}

export const DAYS = makeDays()

/** Last `n` days ending today (inclusive). */
export const lastDays = (n: number) => DAYS.slice(-n)

/** Mean kcal over tracked days only; null when nothing is tracked. */
export function avgKcal(days: Day[]): number | null {
  const tracked = days.filter((d) => d.kcal != null && !d.today)
  if (tracked.length === 0) return null
  return Math.round(
    tracked.reduce((s, d) => s + (d.kcal as number), 0) / tracked.length
  )
}

/** Rolling 7-day average (tracked days only) for each of the last `n` days. */
export function rolling7(n: number): { date: Date; avg: number | null }[] {
  const out: { date: Date; avg: number | null }[] = []
  for (let end = DAYS.length - n; end < DAYS.length; end++) {
    const win = DAYS.slice(Math.max(0, end - 6), end + 1).filter(
      (d) => d.kcal != null && !d.today
    )
    out.push({
      date: DAYS[end].date,
      avg:
        win.length === 0
          ? null
          : Math.round(win.reduce((s, d) => s + (d.kcal as number), 0) / win.length),
    })
  }
  return out
}

export const inRange = (kcal: number) => kcal >= RANGE_LO && kcal <= RANGE_HI

/** Completed tracked days of the last 7 that landed in the range band. */
export function inRangeStatsFor(days: Day[]) {
  const tracked = days.filter((d) => d.kcal != null && !d.today)
  return {
    inRange: tracked.filter((d) => inRange(d.kcal as number)).length,
    tracked: tracked.length,
    days, // includes today — RangeDots renders it as the small forming dot
    // The band earns its place only after a week of near-daily use:
    // a full 7-day window with at least 5 tracked days.
    enough: days.length === 7 && tracked.length >= 5,
  }
}

export const inRangeStats = () => inRangeStatsFor(lastDays(7))

/** 7-day window ending `offset` weeks back (offset 0 = ends today). Shorter at the data edge. */
export function weekSliceEnding(offset: number): Day[] {
  const end = DAYS.length - offset * 7
  if (end <= 0) return [] // a negative end would wrap around via slice()
  return DAYS.slice(Math.max(0, end - 7), end)
}

/** Oldest reachable pager offset — the last window is partial, showing the gated state. */
export const MAX_WEEK_OFFSET = Math.floor((DAYS.length - 1) / 7)

export function fmtRange(days: Day[]): string {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const a = days[0].date
  const b = days[days.length - 1].date
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${M[b.getMonth()]}`
    : `${a.getDate()} ${M[a.getMonth()]} – ${b.getDate()} ${M[b.getMonth()]}`
}

export const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"]
export const fmtDay = (d: Date) => WEEKDAY[d.getDay()]
