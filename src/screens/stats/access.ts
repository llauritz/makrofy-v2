import type { Plan } from "@/data/plans"

// Who sees the statistics dashboard (Nov 2026). The dashboard is being
// reworked and may become a paid feature, so for now it is open to Pro and
// Unlimited only: Free users get no stats button on the summary card, and
// with it no way into the screen. The screen, its charts and the week report
// are all kept as they are; widen PLANS_WITH_STATS (or drop the gate) to
// bring them back for everyone.
//
// The plan is the one the app acts on (`effectivePlan`, via the AI cycle), so
// a lapsed or cancelled subscription counts as Free. While the plan is still
// loading the answer is no: the button never shows for a Free user and then
// leaves. A returning launch has the plan from its first frame (the plan
// mirror, ADR 0011), so a subscriber's button is there from the start.

export const PLANS_WITH_STATS: readonly Plan[] = ["pro", "unlimited"]

/** Whether the stats dashboard is offered; false while the plan is unknown. */
export function statsAvailable(plan: Plan | null | undefined): boolean {
  return plan != null && PLANS_WITH_STATS.includes(plan)
}
