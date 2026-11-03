import { isEntitling, type Plan, type SubscriptionStatus } from "./entitlement.js"

// The AI allowance (ADR 0013, ADR 0016): how many ✨ fills a plan allows per
// fixed 30-day cycle, which cycle a moment falls in, and whether one more
// round trip may start. Pure, so the server's gate and the app's counter
// share one copy of the rules: the aiFill callable enforces them, the app
// only shows them (src/data/plans.ts re-exports from here).

/** ✨ fills per 30-day cycle (price review, Nov 2026). */
export const CYCLE_LIMIT: Record<Plan, number> = {
  free: 10,
  pro: 1_000,
  unlimited: 10_000,
}

/** Length of an allowance cycle in days (#64: fixed cycle, not a calendar month). */
export const CYCLE_DAYS = 30

/**
 * Days a paid plan holds past the end of its paid period. Paddle keeps the
 * status at past_due while it retries a card; this covers a renewal webhook
 * that arrives late, and a phone that has been offline.
 */
export const OFFLINE_GRACE_DAYS = 7

const DAY_MS = 86_400_000

/**
 * The 30-day cycle `now` falls in, counted in whole cycles from the anchor
 * (#64: the cycle starts when the plan starts — account creation for Free, the
 * entitlement doc's `planStartedAt` once a plan has been bought). A clock set
 * before the anchor stays in the first cycle.
 */
export function cycleWindow(
  anchor: Date,
  now: Date
): { start: Date; end: Date } {
  const length = CYCLE_DAYS * DAY_MS
  const k = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / length))
  const start = new Date(anchor.getTime() + k * length)
  return { start, end: new Date(start.getTime() + length) }
}

/** The cycle doc's id: its start instant, so a re-anchor never reuses one. */
export function cycleDocId(start: Date): string {
  return start.toISOString()
}

/** The entitlement fields the plan depends on. */
export interface PlanFields {
  plan: Plan
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
}

/** The plan the gate acts on: the doc's, unless it lapsed or ran past grace. */
export function effectivePlan(e: PlanFields | null, now: Date): Plan {
  if (e === null || e.plan === "free" || !isEntitling(e.status)) return "free"
  if (
    e.currentPeriodEnd !== null &&
    now.getTime() > e.currentPeriodEnd.getTime() + OFFLINE_GRACE_DAYS * DAY_MS
  ) {
    return "free"
  }
  return e.plan
}

// Two brakes besides the allowance itself. A person tapping ✨ never comes
// near either; they stop a script that calls the function directly.
/** At most this many round trips in any one burst window. */
export const BURST_CALLS = 10
export const BURST_WINDOW_MS = 60_000
/**
 * A clarifying answer rides free (it is a call, not a fill), but there is at
 * most one per fill. The slack covers a retry after a failed answer.
 */
export const FOLLOW_UP_SLACK = 3

/** One cycle's counters as the cycle doc stores them. */
export interface CycleCounts {
  fills: number
  calls: number
  /** Start of the current burst window, ms. */
  burstStartMs: number
  burstCalls: number
}

export const NO_COUNTS: CycleCounts = {
  fills: 0,
  calls: 0,
  burstStartMs: 0,
  burstCalls: 0,
}

export type Refusal = "cycle-exhausted" | "too-fast" | "follow-ups"

export type Admission =
  { ok: true; next: CycleCounts } | { ok: false; refusal: Refusal }

/**
 * Whether one more round trip may start, and the counts once it has. A fill
 * is refused at the plan's limit; the answer to a clarifying question
 * (`final`) is not, but it can't outnumber the fills.
 */
export function admitCall(
  counts: CycleCounts,
  { final, limit, nowMs }: { final: boolean; limit: number; nowMs: number }
): Admission {
  if (!final && counts.fills >= limit) {
    return { ok: false, refusal: "cycle-exhausted" }
  }
  if (final && counts.calls - counts.fills >= counts.fills + FOLLOW_UP_SLACK) {
    return { ok: false, refusal: "follow-ups" }
  }
  const inWindow = nowMs - counts.burstStartMs < BURST_WINDOW_MS
  if (inWindow && counts.burstCalls >= BURST_CALLS) {
    return { ok: false, refusal: "too-fast" }
  }
  return {
    ok: true,
    next: {
      fills: counts.fills + (final ? 0 : 1),
      calls: counts.calls + 1,
      burstStartMs: inWindow ? counts.burstStartMs : nowMs,
      burstCalls: inWindow ? counts.burstCalls + 1 : 1,
    },
  }
}
