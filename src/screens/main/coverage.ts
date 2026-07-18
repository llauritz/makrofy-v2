import type { CoverageLevel } from "@/data/days"
import { localDay } from "@/lib/day"

// The Coverage control's visibility gate (issue #42): pure clock/day logic,
// kept out of the component so the evening rule is testable and tuned in one
// place. Coverage itself (CONTEXT.md) is the days sidecar's business
// (src/data/days.ts); this only decides when the chips are offered.

/** Today's control appears only in the evening — from this device-local hour. */
export const COVERAGE_EVENING_HOUR = 20

/** The chip order, least to most covered. */
export const COVERAGE_LEVELS: readonly CoverageLevel[] = [
  "some",
  "most",
  "everything",
]

/**
 * Whether the Coverage chips belong under a Day's Entry list: any past Day
 * holding Entries (the closed-day control), or today once the evening hour
 * has struck (the "day is winding down" moment). Never for an empty Day —
 * it contributes nothing to stats regardless of its label (ADR 0006) — and
 * never for a future one.
 */
export function showCoverageControl(
  day: string,
  entryCount: number,
  now: Date = new Date(),
): boolean {
  if (entryCount === 0) return false
  const today = localDay(now)
  if (day < today) return true
  return day === today && now.getHours() >= COVERAGE_EVENING_HOUR
}

/**
 * When the gate will next open on its own — this evening's boundary, while
 * today's control is still waiting on the clock — or null when no flip is
 * pending. The control schedules one re-render off this, so the chips appear
 * at the hour without a tap. (Midnight needs no timer: the evening hour
 * already opened the gate, and past midnight the Day is past and stays open.)
 */
export function nextCoverageGateChange(
  day: string,
  entryCount: number,
  now: Date = new Date(),
): Date | null {
  if (entryCount === 0 || day !== localDay(now)) return null
  if (now.getHours() >= COVERAGE_EVENING_HOUR) return null
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    COVERAGE_EVENING_HOUR,
  )
}
