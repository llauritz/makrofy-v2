import { planForPrice, type Billing, type PaidPlan } from "./paddle-config.js"

// From a Paddle subscription to the user's entitlement doc — pure, so the
// rules of the plan ladder are testable without Firebase (ADR 0012).
//
// The doc lives at /users/{uid}/settings/subscription and only the functions
// write it (Admin SDK; the security rules refuse every client write). The app
// reads it like any other doc and derives its limits from `plan`; the AI
// allowance cycle anchors on `planStartedAt` (ADR 0013), which therefore moves
// only on a purchase, an upgrade, a lapse to free or a resubscribe. A renewal,
// a switch between monthly and yearly, a downgrade, and a pause with its
// resume all keep it (the owner's call, Nov 2026: a downgrade must not hand
// out a fresh allowance).

export type Plan = "free" | PaidPlan
export type SubscriptionStatus =
  "active" | "trialing" | "past_due" | "paused" | "canceled"

/** The part of a Paddle subscription entity we read. */
export interface PaddleSubscription {
  id: string
  status: SubscriptionStatus
  customer_id: string
  custom_data?: Record<string, unknown> | null
  items: Array<{ price?: { id: string } | null }>
  current_billing_period?: { starts_at: string; ends_at: string } | null
  scheduled_change?: {
    action: "cancel" | "pause" | "resume"
    effective_at: string
  } | null
  updated_at?: string
}

export interface Entitlement {
  plan: Plan
  billing: Billing | null
  status: SubscriptionStatus
  provider: "paddle"
  customerId: string
  subscriptionId: string
  /** When the current plan began; the AI cycle's anchor. */
  planStartedAt: Date
  /** End of the paid period; drives the app's offline grace. */
  currentPeriodEnd: Date | null
  /** Set while a cancellation is scheduled for the end of the period. */
  cancelsAt: Date | null
  /** occurred_at of the last event applied — older events are ignored. */
  eventAt: Date
}

export type Decision =
  { kind: "write"; entitlement: Entitlement } | { kind: "skip"; reason: string }

/** Statuses that keep a paid plan: Paddle is still collecting (or retrying). */
export function isEntitling(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
}

/** A subscription as last seen, with when that state was current. */
export interface SeenSubscription {
  sub: PaddleSubscription
  occurredAt: Date
}

const RANK: Record<Plan, number> = { free: 0, pro: 1, unlimited: 2 }

function rankOf(sub: PaddleSubscription): number {
  const priceId = sub.items.find((item) => item.price?.id)?.price?.id
  const sold = priceId ? planForPrice(priceId) : null
  return sold ? RANK[sold.plan] : 0
}

/**
 * The subscription the entitlement follows when a user has more than one —
 * two checkouts on two devices, or a second plan bought instead of upgrading.
 * Of those still entitling, the highest plan wins, then the newest; with none
 * entitling, the one that just changed, so the doc shows its lapse. Without
 * this, cancelling the newer of two left the user on Free while the older
 * one was still charging them.
 */
export function leadSubscription(
  changed: SeenSubscription,
  others: SeenSubscription[]
): SeenSubscription {
  const live = [
    changed,
    ...others.filter((o) => o.sub.id !== changed.sub.id),
  ].filter((s) => isEntitling(s.sub.status))
  if (live.length === 0) return changed
  return live.reduce((best, s) => {
    const diff = rankOf(s.sub) - rankOf(best.sub)
    return diff > 0 ||
      (diff === 0 && s.occurredAt.getTime() > best.occurredAt.getTime())
      ? s
      : best
  })
}

/** Whether the AI cycle keeps its anchor through this change. */
function keepsCycle(
  prev: Entitlement | null,
  sub: PaddleSubscription,
  plan: Plan
): boolean {
  if (!prev) return false
  // Renewal, or monthly ↔ yearly.
  if (prev.plan === plan) return true
  // Downgrade between paid plans: the used fills carry over.
  if (plan !== "free" && prev.plan !== "free" && RANK[plan] < RANK[prev.plan])
    return true
  // A pause holds the cycle, and resuming the same subscription picks it up.
  if (sub.status === "paused") return true
  return (
    plan !== "free" &&
    prev.status === "paused" &&
    prev.subscriptionId === sub.id
  )
}

/** The Firebase uid the checkout attached as custom data, if any. */
export function uidOf(sub: PaddleSubscription): string | null {
  const uid = sub.custom_data?.uid
  return typeof uid === "string" && /^[A-Za-z0-9]{1,128}$/.test(uid)
    ? uid
    : null
}

/**
 * What the entitlement doc should become after `sub` changed at `occurredAt`.
 * Throws for a paid subscription on a price we don't know — a config error
 * that a retry after a fix should pick up, not one to swallow.
 */
export function nextEntitlement(
  prev: Entitlement | null,
  sub: PaddleSubscription,
  occurredAt: Date
): Decision {
  if (prev && occurredAt.getTime() < prev.eventAt.getTime()) {
    return { kind: "skip", reason: "older than the last applied event" }
  }
  const entitling = isEntitling(sub.status)
  // A second subscription (a double purchase, or an old one's late cancel)
  // must not knock out the one that is paying.
  if (
    prev &&
    prev.subscriptionId !== sub.id &&
    isEntitling(prev.status) &&
    !entitling
  ) {
    return { kind: "skip", reason: "another subscription is active" }
  }

  let plan: Plan = "free"
  let billing: Billing | null = null
  if (entitling) {
    const priceId = sub.items.find((item) => item.price?.id)?.price?.id
    const sold = priceId ? planForPrice(priceId) : null
    if (!sold) {
      throw new Error(`Subscription ${sub.id} is on unknown price ${priceId}`)
    }
    plan = sold.plan
    billing = sold.billing
  }

  const cancel =
    sub.scheduled_change?.action === "cancel"
      ? new Date(sub.scheduled_change.effective_at)
      : null
  return {
    kind: "write",
    entitlement: {
      plan,
      billing,
      status: sub.status,
      provider: "paddle",
      customerId: sub.customer_id,
      subscriptionId: sub.id,
      planStartedAt: keepsCycle(prev, sub, plan)
        ? prev!.planStartedAt
        : occurredAt,
      currentPeriodEnd: sub.current_billing_period
        ? new Date(sub.current_billing_period.ends_at)
        : null,
      cancelsAt: cancel,
      eventAt: occurredAt,
    },
  }
}
