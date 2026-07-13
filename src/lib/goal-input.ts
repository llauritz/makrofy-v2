// Turn a typed string into a valid kcal Goal. Shared by the onboarding goal
// screen and the settings goal editor so both forgive the same way: round
// decimals (never truncate — a V1 failure class), keep the figure sane, and
// never let a NaN/0 Goal reach the ring (which would divide by it).

/** A Goal must be a positive number of kcal. */
export const MIN_GOAL_KCAL = 1
/** Well above any real daily intake; guards against fat-fingered garbage. */
export const MAX_GOAL_KCAL = 20_000

/** Round to a whole kcal and hold it within [MIN, MAX]. */
export function clampGoalKcal(n: number): number {
  return Math.min(MAX_GOAL_KCAL, Math.max(MIN_GOAL_KCAL, Math.round(n)))
}

/**
 * Parse a goal field. Returns a valid whole-kcal figure, or null when the
 * input isn't a usable positive number (blank, non-numeric, zero/negative,
 * non-finite) — callers keep their last good value on null. Out-of-range but
 * otherwise valid numbers are clamped, not rejected, so a stray extra digit
 * doesn't erase the field.
 */
export function parseGoalKcal(raw: string): number | null {
  const text = raw.trim()
  if (text === "") return null
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return null
  return clampGoalKcal(n)
}
